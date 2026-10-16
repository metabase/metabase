import {
  PRODUCT_ANALYTICS_DOCUMENT_ATTR,
  PRODUCT_ANALYTICS_KINDS,
  PRODUCT_ANALYTICS_SETTINGS_KEY,
  type ProductAnalyticsDefinition,
  type ProductAnalyticsDocumentContext,
  type ProductAnalyticsKind,
  type ProductAnalyticsNodeDefinition,
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

/** The analysis a `productAnalysis` document node holds, if its attribute is valid. */
export function getProductAnalyticsNodeDefinition(
  value: unknown,
): ProductAnalyticsNodeDefinition | undefined {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isProductAnalyticsKind(value.kind) ||
    !isRecord(value.settings)
  ) {
    return undefined;
  }
  return { version: 1, kind: value.kind, settings: value.settings };
}

/**
 * What the analyses in a document share, read from its doc node. Undefined
 * when the document isn't an analysis document.
 */
export function getProductAnalyticsDocumentContext(
  content: { attrs?: Record<string, unknown> } | null | undefined,
): ProductAnalyticsDocumentContext | undefined {
  const context: unknown = content?.attrs?.[PRODUCT_ANALYTICS_DOCUMENT_ATTR];
  if (
    !isRecord(context) ||
    context.version !== 1 ||
    typeof context.date_range !== "string"
  ) {
    return undefined;
  }
  const tableId = context.table_id;
  return {
    version: 1,
    table_id:
      typeof tableId === "number" && isConcreteTableId(tableId)
        ? tableId
        : null,
    date_range: context.date_range,
  };
}
