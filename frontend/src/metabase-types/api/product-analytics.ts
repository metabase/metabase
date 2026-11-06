import type { ConcreteTableId } from "./table";

/**
 * The `visualization_settings` key that marks a card as a product analytics
 * analysis. The card's query is compiled from this definition, which is what
 * the event analysis builder edits.
 */
export const PRODUCT_ANALYTICS_SETTINGS_KEY = "product_analytics.analysis";

export const PRODUCT_ANALYTICS_KINDS = [
  "funnel",
  "paths",
  "habit",
  "lifecycle",
  "cohorts",
] as const;

export type ProductAnalyticsKind = (typeof PRODUCT_ANALYTICS_KINDS)[number];

export type ProductAnalyticsDefinition = {
  version: 1;
  kind: ProductAnalyticsKind;
  table_id: ConcreteTableId;
  /** The settings the user changed. Untrusted: the builder validates them. */
  settings: Record<string, unknown>;
};
