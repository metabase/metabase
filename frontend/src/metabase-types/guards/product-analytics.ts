import {
  PRODUCT_ANALYTICS_KINDS,
  PRODUCT_ANALYTICS_SETTINGS_KEY,
  type ProductAnalyticsDefinition,
  type ProductAnalyticsKind,
  type VisualizationSettings,
  isConcreteTableId,
} from "metabase-types/api";

import { isRecord } from "./common";

export const isProductAnalyticsKind = (
  value: unknown,
): value is ProductAnalyticsKind =>
  PRODUCT_ANALYTICS_KINDS.some((kind) => kind === value);

/** The analysis a card was saved from, if it was saved from the event analysis builder. */
export function getProductAnalyticsDefinition(
  settings: VisualizationSettings | null | undefined,
): ProductAnalyticsDefinition | undefined {
  const definition: unknown = settings?.[PRODUCT_ANALYTICS_SETTINGS_KEY];
  if (
    !isRecord(definition) ||
    definition.version !== 1 ||
    !isProductAnalyticsKind(definition.kind) ||
    typeof definition.table_id !== "number" ||
    !isConcreteTableId(definition.table_id) ||
    !isRecord(definition.settings)
  ) {
    return undefined;
  }
  return {
    version: 1,
    kind: definition.kind,
    table_id: definition.table_id,
    settings: definition.settings,
  };
}

export function isProductAnalyticsCard(card: {
  visualization_settings?: VisualizationSettings | null;
}): boolean {
  return (
    getProductAnalyticsDefinition(card.visualization_settings) !== undefined
  );
}
