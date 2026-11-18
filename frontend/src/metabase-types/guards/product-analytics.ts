import {
  PRODUCT_ANALYTICS_KINDS,
  type ProductAnalyticsKind,
} from "metabase-types/api";

export function isProductAnalyticsKind(
  value: unknown,
): value is ProductAnalyticsKind {
  return PRODUCT_ANALYTICS_KINDS.some((kind) => kind === value);
}
