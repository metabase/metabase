export const PRODUCT_ANALYTICS_KINDS = ["habit"] as const;

export type ProductAnalyticsKind = (typeof PRODUCT_ANALYTICS_KINDS)[number];
