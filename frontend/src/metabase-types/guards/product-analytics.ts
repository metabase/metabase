import {
  PRODUCT_ANALYTICS_DOCUMENT_ATTR,
  PRODUCT_ANALYTICS_KINDS,
  type ProductAnalyticsDocumentContext,
  type ProductAnalyticsKind,
  type ProductAnalyticsNodeDefinition,
  isConcreteTableId,
} from "metabase-types/api";

import { isRecord } from "./common";

export const isProductAnalyticsKind = (
  value: unknown,
): value is ProductAnalyticsKind =>
  PRODUCT_ANALYTICS_KINDS.some((kind) => kind === value);

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
