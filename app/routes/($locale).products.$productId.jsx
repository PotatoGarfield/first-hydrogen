import {useRef, useEffect, Suspense} from 'react';
import {Disclosure, Listbox} from '@headlessui/react';
import {json, defer} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Await, Form} from '@remix-run/react';
import {useSelector} from 'react-redux';
import {v4 as uuidv4} from 'uuid';
import Cookies from 'js-cookie';
import {Accordion, AccordionItem} from '@nextui-org/react';
import {Down, Up, Commodity} from '@icon-park/react';

import {AnalyticsPageType, VariantSelector} from '@shopify/hydrogen';
import invariant from 'tiny-invariant';
import clsx from 'clsx';
import {
  Heading,
  IconCaret,
  IconCheck,
  IconClose,
  ProductGallery,
  Section,
  Text,
  Link,
  ProductPolicy,
  ProductFooter,
} from '~/components';
import {seoPayload} from '~/lib/seo.server';
import {routeHeaders} from '~/data/cache';
import {MEDIA_FRAGMENT} from '~/data/fragments';

export const headers = routeHeaders;

/**
 * @param {LoaderFunctionArgs}
 */
export async function loader({params, request, context}) {
  const {productId} = params;
  const completedPid = `gid://shopify/Product/${productId}`;
  invariant(productId, 'Missing productId param, check route filename');

  const variants = await context.storefront.query(VARIANTS_QUERY_BY_ID, {
    variables: {
      id: completedPid,
      country: context.storefront.i18n.country,
      language: context.storefront.i18n.language,
    },
  });

  const selectedOptions = variants.product.variants.nodes[0].selectedOptions;

  const {shop, product} = await context.storefront.query(PRODUCT_QUERY_BY_ID, {
    variables: {
      id: completedPid,
      country: context.storefront.i18n.country,
      language: context.storefront.i18n.language,
      selectedOptions,
    },
  });

  if (!product?.id) {
    throw new Response('product', {status: 404});
  }

  // In order to show which variants are available in the UI, we need to query
  // all of them. But there might be a *lot*, so instead separate the variants
  // into it's own separate query that is deferred. So there's a brief moment
  // where variant options might show as available when they're not, but after
  // this deferred query resolves, the UI will update.

  // const recommended = getRecommendedProducts(context.storefront, product.id);

  // TODO: firstVariant is never used because we will always have a selectedVariant due to redirect
  // Investigate if we can avoid the redirect for product pages with no search params for first variant
  const firstVariant = product.variants.nodes[0];
  const selectedVariant = firstVariant;
  // const selectedVariant = product.selectedVariant ?? firstVariant;

  const productAnalytics = {
    productGid: product.id,
    variantGid: selectedVariant.id,
    name: product.title,
    variantName: selectedVariant.title,
    brand: product.vendor,
    price: selectedVariant.price.amount,
  };

  const seo = seoPayload.product({
    product,
    selectedVariant,
    url: request.url,
  });

  return defer({
    variants,
    product,
    shop,
    storeDomain: shop.primaryDomain.url,
    analytics: {
      pageType: AnalyticsPageType.product,
      resourceId: product.id,
      products: [productAnalytics],
      totalValue: parseFloat(selectedVariant.price.amount),
    },
    seo,
  });
}

/**
 * 处理 当前路由 POST 请求
 */
export const action = async ({request, context}) => {
  const formData = await request.formData();
  const action = formData.get('action');
  const variantGid = formData.get('variantGid');
  const variantId = formData.get('variantId');
  const checkoutId = formData.get('checkoutId');
  const checkoutUrl = formData.get('checkoutUrl');
  const checkoutGid = formData.get('checkoutGid');
  const discountCode = formData.get('discountCode');

  // 生成结账链接
  if (action === 'createCheckout') {
    const variantId = variantGid.split('/')[4];
    const checkout = await createCheckout(context.storefront, variantId);
    const checkoutId = new URL(checkout.webUrl).pathname.split('/')[3];
    const checkoutGid = checkout.id;
    const checkoutUrl = checkout.webUrl;
    return json({variantId, checkoutId, checkoutUrl, checkoutGid});
  }

  // 应用折扣码
  if (action === 'applyCheckoutDiscountCode') {
    if (discountCode) {
      await applyCheckoutDiscountCode(
        context.storefront,
        checkoutGid,
        discountCode,
      );
    }
    return json({
      variantId,
      checkoutId,
      checkoutUrl,
      discountCode,
      needRedirect: true,
    });
  }

  return json({});
};

export default function Product() {
  /** @type {LoaderReturnData} */
  const {product, shop, variants} = useLoaderData();
  const {media, title, descriptionHtml, selectedVariant} = product;
  const actionData = useActionData() || {};

  // 跳转到结账页面
  useEffect(() => {
    if (actionData && actionData.needRedirect && actionData.checkoutUrl) {
      window.location.href = actionData.checkoutUrl;
    }
  }, [actionData.needRedirect]);

  return (
    <>
      <Section className="px-0 md:px-8 lg:px-12">
        <div className="grid items-start md:gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-3">
          <div className="h-14"></div>
          <ProductGallery
            media={media.nodes}
            className="w-full lg:col-span-2"
          />

          <div className="sticky md:-mb-nav md:top-nav md:-translate-y-nav md:h-screen md:pt-nav hiddenScroll md:overflow-y-scroll">
            <section className="flex flex-col w-full max-w-xl py-0 md:mx-auto md:max-w-sm md:px-0">
              {/* 商品标题区域 */}
              <div className="grid gap-1 px-4 bg-white mb-2">
                <div className="title-area pt-4 pb-4 ">
                  <div className="current-price text-xl font-medium">
                    {(selectedVariant.price.currencyCode === 'USD' ? '$' : '') +
                      selectedVariant.price.amount || ''}
                  </div>
                  <div className="original-price text-sm text-gray-400 line-through mb-1">
                    {(selectedVariant.compareAtPrice.currencyCode === 'USD'
                      ? '$'
                      : '') + selectedVariant.compareAtPrice.amount || ''}
                  </div>
                  <h3 className="font-bold text-sm font-medium">{title}</h3>
                </div>
              </div>

              {/* 产品详情 */}
              <div className="product-detail-box bg-white mb-2 px-4">
                <Accordion selectionMode="multiple" defaultExpandedKeys={['1']}>
                  <AccordionItem
                    key="1"
                    aria-label="Accordion 1"
                    title="Specifications"
                    className="text-base"
                    disableIndicatorAnimation="true"
                    startContent={
                      <Commodity theme="outline" size="20" fill="#4a4a4a" />
                    }
                    indicator={({isOpen}) =>
                      isOpen ? (
                        <Up theme="outline" size="20" fill="#4a4a4a" />
                      ) : (
                        <Down theme="outline" size="20" fill="#4a4a4a" />
                      )
                    }
                  >
                    <div className="product-detail flex flex-row justify-between items-center mb-3">
                      <div className="product-detail-box-text flex text-sm text-gray-400 font-normal">
                        About this product
                      </div>
                    </div>
                    <div className="divide-line bg-white mb-4">
                      <div className="h-px bg-gray-200"></div>
                    </div>
                    <div className="text-img-area py-4 text-base">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: `<style>p:not(:has(img)) {margin-bottom: 15px;}</style> ${descriptionHtml}`,
                        }}
                      />
                    </div>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* 产品政策 */}
              <div className="policy-box mb-2 px-4 bg-white">
                <ProductPolicy></ProductPolicy>
              </div>

              <Suspense fallback={<ProductForm variants={[]} />}>
                <Await
                  errorElement="There was a problem loading related products"
                  resolve={variants}
                >
                  {(resp) => (
                    <ProductForm
                      variants={resp.product?.variants.nodes || []}
                    />
                  )}
                </Await>
              </Suspense>

              {/* 底部栏信息栏 */}
              <ProductFooter shopname={shop.name}></ProductFooter>
            </section>
          </div>
        </div>
      </Section>
    </>
  );
}

/**
 * @param {{
 *   variants: ProductVariantFragmentFragment[];
 * }}
 */
export function ProductForm({variants}) {
  /** @type {LoaderReturnData} */
  const {shop, product, analytics} = useLoaderData();
  const actionData = useActionData() || {};

  const checkoutFormBtnRef = useRef(null);
  const discountFormBtnRef = useRef(null);
  const buynowClickNum = useSelector((state) => state.clickNum);
  const discountCode = useSelector((state) => state.couponCode);

  // 处理点击购买按钮行为
  useEffect(() => {
    if (!(buynowClickNum !== 0 && actionData.checkoutUrl)) return;
    // 事件统计：开始下单
    sendPageEvent(
      'InitiateCheckout',
      shop,
      product,
      actionData.variantId,
      actionData.checkoutId,
      discountCode,
    );
    // 模拟提交，应用折扣码
    discountFormBtnRef.current.click();
  }, [buynowClickNum]);

  // 首次执行
  useEffect(() => {
    // 事件统计：浏览页面
    sendPageEvent('ViewContent', shop, product);

    // 模拟提交，延迟自动创建结账数据
    const timeoutId = setTimeout(() => {
      checkoutFormBtnRef.current.click();
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, []);

  /**
   * Likewise, we're defaulting to the first variant for purposes
   * of add to cart if there is none returned from the loader.
   * A developer can opt out of this, too.
   */
  const selectedVariant = product.selectedVariant;
  const isOutOfStock = !selectedVariant?.availableForSale;
  const isOnSale =
    selectedVariant?.price?.amount &&
    selectedVariant?.compareAtPrice?.amount &&
    selectedVariant?.price?.amount < selectedVariant?.compareAtPrice?.amount;

  const productAnalytics = {
    ...analytics.products[0],
    quantity: 1,
  };

  return (
    <div className="hidden grid gap-10">
      <div className="grid gap-4">
        <VariantSelector
          handle={product.handle}
          options={product.options}
          variants={variants}
        >
          {({option}) => {
            return (
              <div
                key={option.name}
                className="flex flex-col flex-wrap mb-4 gap-y-2 last:mb-0"
              >
                <Heading as="legend" size="lead" className="min-w-[4rem]">
                  {option.name}
                </Heading>
                <div className="flex flex-wrap items-baseline gap-4">
                  {option.values.length > 7 ? (
                    <div className="relative w-full">
                      <Listbox>
                        {({open}) => (
                          <>
                            <Listbox.Button
                              ref={popupCloseBtnRef}
                              className={clsx(
                                'flex items-center justify-between w-full py-3 px-4 border border-primary',
                                open
                                  ? 'rounded-b md:rounded-t md:rounded-b-none'
                                  : 'rounded',
                              )}
                            >
                              <span>{option.value}</span>
                              <IconCaret direction={open ? 'up' : 'down'} />
                            </Listbox.Button>
                            <Listbox.Options
                              className={clsx(
                                'border-primary bg-contrast absolute bottom-12 z-30 grid h-48 w-full overflow-y-scroll rounded-t border px-2 py-2 transition-[max-height] duration-150 sm:bottom-auto md:rounded-b md:rounded-t-none md:border-t-0 md:border-b',
                                open ? 'max-h-48' : 'max-h-0',
                              )}
                            >
                              {option.values
                                .filter((value) => value.isAvailable)
                                .map(({value, to, isActive}) => (
                                  <Listbox.Option
                                    key={`option-${option.name}-${value}`}
                                    value={value}
                                  >
                                    {({active}) => (
                                      <Link
                                        to={to}
                                        className={clsx(
                                          'text-primary w-full p-2 transition rounded flex justify-start items-center text-left cursor-pointer',
                                          active && 'bg-primary/10',
                                        )}
                                        onClick={() => {
                                          if (!popupCloseBtnRef?.current)
                                            return;
                                          popupCloseBtnRef.current.click();
                                        }}
                                      >
                                        {value}
                                        {isActive && (
                                          <span className="ml-2">
                                            <IconCheck />
                                          </span>
                                        )}
                                      </Link>
                                    )}
                                  </Listbox.Option>
                                ))}
                            </Listbox.Options>
                          </>
                        )}
                      </Listbox>
                    </div>
                  ) : (
                    option.values.map(({value, isAvailable, isActive, to}) => (
                      <Link
                        key={option.name + value}
                        to={to}
                        preventScrollReset
                        prefetch="intent"
                        replace
                        className={clsx(
                          'leading-none py-1 border-b-[1.5px] cursor-pointer transition-all duration-200',
                          isActive
                            ? 'border-primary/50 text-[#EE1D52] border-[#EE1D52]'
                            : 'border-primary/0',
                          isAvailable ? 'opacity-100' : 'opacity-50',
                        )}
                      >
                        {value}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          }}
        </VariantSelector>
        {selectedVariant && (
          <div className="grid items-stretch gap-4">
            {!isOutOfStock && (
              <>
                <Form method="post">
                  <input type="hidden" name="action" value="createCheckout" />
                  <input
                    type="hidden"
                    name="variantGid"
                    value={selectedVariant?.id}
                  />
                  <button ref={checkoutFormBtnRef}></button>
                </Form>
                <Form method="post">
                  <input
                    type="hidden"
                    name="action"
                    value="applyCheckoutDiscountCode"
                  />
                  <input
                    type="hidden"
                    name="discountCode"
                    value={discountCode}
                  />
                  <input
                    type="hidden"
                    name="checkoutGid"
                    value={actionData?.checkoutGid || ''}
                  />
                  <input
                    type="hidden"
                    name="checkoutUrl"
                    value={actionData?.checkoutUrl || ''}
                  />
                  <input
                    type="hidden"
                    name="variantId"
                    value={actionData?.variantId || ''}
                  />
                  <input
                    type="hidden"
                    name="checkoutId"
                    value={actionData?.checkoutId || ''}
                  />
                  <button ref={discountFormBtnRef}></button>
                </Form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   title: string;
 *   content: string;
 *   learnMore?: string;
 * }}
 */
function ProductDetail({title, content, learnMore}) {
  return (
    <Disclosure key={title} as="div" className="grid w-full gap-2">
      {({open}) => (
        <>
          <Disclosure.Button className="text-left">
            <div className="flex justify-between">
              <Text size="lead" as="h4">
                {title}
              </Text>
              <IconClose
                className={clsx(
                  'transition-transform transform-gpu duration-200',
                  !open && 'rotate-[45deg]',
                )}
              />
            </div>
          </Disclosure.Button>

          <Disclosure.Panel className={'pb-4 pt-2 grid gap-2'}>
            <div
              className="prose dark:prose-invert"
              dangerouslySetInnerHTML={{__html: content}}
            />
            {learnMore && (
              <div className="">
                <Link
                  className="pb-px border-b border-primary/30 text-primary/50"
                  to={learnMore}
                >
                  Learn more
                </Link>
              </div>
            )}
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariantFragment on ProductVariant {
    id
    availableForSale
    selectedOptions {
      name
      value
    }
    image {
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    compareAtPrice {
      amount
      currencyCode
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
  }
`;

const PRODUCT_QUERY_BY_ID = `#graphql
query Product(
  $id: ID!,
  $country: CountryCode
  $language: LanguageCode
  $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(id: $id) {
      id
      title
      vendor
      handle
      descriptionHtml
      description
      options {
        name
        values
      }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions) {
        ...ProductVariantFragment
      }
      media(first: 7) {
        nodes {
          ...Media
        }
      }
      variants(first: 1) {
        nodes {
          ...ProductVariantFragment
        }
      }
      seo {
        description
        title
      }
    }
    shop {
      name
      primaryDomain {
        url
        host
      }
      shippingPolicy {
        body
        handle
      }
      refundPolicy {
        body
        handle
      }
    }
  }
  ${MEDIA_FRAGMENT}
  ${PRODUCT_VARIANT_FRAGMENT}
`;

const VARIANTS_QUERY_BY_ID = `#graphql
  query variants(
    $country: CountryCode
    $language: LanguageCode
    $id: ID!
  ) @inContext(country: $country, language: $language) {
    product(id: $id) {
      variants(first: 250) {
        nodes {
          ...ProductVariantFragment
        }
      }
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
`;

/**
 * 创建结账链接
 */
async function createCheckout(storefront, variantId) {
  const CHECKOUT_CREATE = `#graphql
    mutation CheckoutCreate {
      checkoutCreate(
        input: {
          lineItems: [
            {variantId: "gid://shopify/ProductVariant/${variantId}", quantity: 1}
          ]
        }
      ) {
        checkout {
          id
          webUrl
        }
      }
    }
    `;
  const {checkoutCreate} = await storefront.mutate(CHECKOUT_CREATE);
  return checkoutCreate.checkout;
}

/**
 * 创建结账链接
 */
async function applyCheckoutDiscountCode(storefront, checkoutId, discountCode) {
  const CHECKOUT_DISCOUNT_CODE_APPLY_V2 = `#graphql
    mutation CheckoutDiscountCodeApplyV2(
      $discountCode: String!
      $checkoutId: ID!
    ) {
      checkoutDiscountCodeApplyV2(discountCode: $discountCode, checkoutId: $checkoutId) {
        checkout {
          id
        }
      }
    }
    `;
  await storefront.mutate(CHECKOUT_DISCOUNT_CODE_APPLY_V2, {
    variables: {checkoutId, discountCode},
  });
}

/**
 * 发送页面事件到服务端
 * event: ViewContent, InitiateCheckout
 * @see https://business-api.tiktok.com/portal/docs?id=1741601162187777
 */
function sendPageEvent(
  event,
  shop,
  product,
  variantId = null,
  checkoutId = null,
  discountCode = null,
) {
  const _getCidInfo = () => {
    const ret = {source: 'web', cid: null};
    const searchParams = new URLSearchParams(window.location.search);
    const ttclid = searchParams.get('ttclid');
    if (ttclid) {
      ret.source = 'tiktok';
      ret.cid = ttclid;
    }
    return ret;
  };

  const _getUserId = () => {
    let userId = Cookies.get('_user_id');
    if (!userId) {
      userId = uuidv4();
      Cookies.set('_user_id', userId, {expires: 365});
    }
    return userId;
  };

  let data = {};
  const cidInfo = _getCidInfo();
  data.source = cidInfo.source;
  data.shop = shop.primaryDomain.host;
  data.event = event;
  data.eventId = uuidv4();
  data.userId = _getUserId();
  data.cid = cidInfo.cid;
  data.page = window.location.href;
  data.productId = product.id.split('/')[4];
  data.productVariantId = variantId;
  data.productPrice = Number(product.variants.nodes[0].price.amount);
  data.productCurrency = product.variants.nodes[0].price.currencyCode;
  data.productName = product.title;
  data.productDescription = product.description;
  data.checkoutId = checkoutId;
  data.discountCode = discountCode;

  const api = 'https://seller.taplike.com/api/common/hydrogen/trackEvent';
  //const api = 'http://10.20.1.10:30030/common/hydrogen/trackEvent';
  fetch(api, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
}
