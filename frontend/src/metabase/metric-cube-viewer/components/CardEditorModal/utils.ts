import type { MetricsViewerDimensionBreakoutType } from "metabase/common/metrics-viewer";
import { isValidDisplayTypeForDimensionBreakout } from "metabase/metrics-viewer/components/MetricControls/LeftControls/utils";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils/dimension-breakout-config";

import { isLowCardinality } from "../../generators/shared";
import type {
  CubeCard,
  CubeCatalog,
  CubeDimension,
  CubeDimensionKey,
  CubeSeries,
} from "../../types";

export const MAX_SERIES = 4;
/** Second dimensions with at most this many values are marked "Recommended". */
export const RECOMMENDED_CARDINALITY_MAX = 10;

/** The editable part of a card; the id and kind are added on save. */
export type CardDraft = Pick<CubeCard, "series" | "dimensionKeys" | "display">;

export interface SecondDimensionOption {
  dimension: CubeDimension;
  isRecommended: boolean;
}

export function createEmptyDraft(catalog: CubeCatalog): CardDraft | null {
  const [firstMeasure] = catalog.measures;
  if (!firstMeasure) {
    return null;
  }
  return {
    series: [{ measureId: firstMeasure.id, segmentIds: [] }],
    dimensionKeys: [],
    display: "scalar",
  };
}

export function draftToCard(draft: CardDraft, id: string): CubeCard {
  return { id, kind: "custom", ...draft };
}

/** Dimensions that every series' measure supports, in catalog order. */
export function getSupportedDimensions(
  catalog: CubeCatalog,
  series: CubeSeries[],
): CubeDimension[] {
  const measures = series.flatMap((entry) => {
    const measure = catalog.measures.find((m) => m.id === entry.measureId);
    return measure ? [measure] : [];
  });
  if (measures.length === 0) {
    return [];
  }
  return catalog.dimensions.filter((dimension) =>
    measures.every((measure) => measure.dimensionIds[dimension.key] != null),
  );
}

export function getBreakoutType(
  catalog: CubeCatalog,
  dimensionKeys: CubeDimensionKey[],
): MetricsViewerDimensionBreakoutType {
  const [firstKey] = dimensionKeys;
  const dimension = catalog.dimensions.find((d) => d.key === firstKey);
  return dimension?.type ?? "scalar";
}

/** A second dimension needs one series and a non-geo first dimension. */
export function canUseSecondDimension(
  catalog: CubeCatalog,
  draft: CardDraft,
): boolean {
  const [firstKey] = draft.dimensionKeys;
  if (draft.series.length !== 1 || firstKey == null) {
    return false;
  }
  return getBreakoutType(catalog, draft.dimensionKeys) !== "geo";
}

/** Category and boolean dimensions the series support, low-cardinality first. */
export function getSecondDimensionOptions(
  catalog: CubeCatalog,
  draft: CardDraft,
): SecondDimensionOption[] {
  if (!canUseSecondDimension(catalog, draft)) {
    return [];
  }
  const [firstKey] = draft.dimensionKeys;
  const options = getSupportedDimensions(catalog, draft.series)
    .filter(
      (dimension) =>
        dimension.key !== firstKey &&
        (dimension.type === "category" || dimension.type === "boolean"),
    )
    .map((dimension) => ({
      dimension,
      isRecommended: isLowCardinality(dimension, RECOMMENDED_CARDINALITY_MAX),
    }));
  return [
    ...options.filter((option) => option.isRecommended),
    ...options.filter((option) => !option.isRecommended),
  ];
}

/**
 * Re-applies the editor rules after any change: drops dimensions the series
 * no longer support, drops a second dimension that is no longer allowed, and
 * resets a display that is invalid for the first dimension's type.
 */
export function normalizeDraft(
  catalog: CubeCatalog,
  draft: CardDraft,
): CardDraft {
  const supportedKeys = new Set(
    getSupportedDimensions(catalog, draft.series).map((d) => d.key),
  );
  const [firstKey, secondKey] = draft.dimensionKeys;
  const dimensionKeys: CubeDimensionKey[] =
    firstKey != null && supportedKeys.has(firstKey) ? [firstKey] : [];

  if (secondKey != null) {
    const candidate = { ...draft, dimensionKeys };
    const isAllowed = getSecondDimensionOptions(catalog, candidate).some(
      (option) => option.dimension.key === secondKey,
    );
    if (isAllowed) {
      dimensionKeys.push(secondKey);
    }
  }

  const breakoutType = getBreakoutType(catalog, dimensionKeys);
  const display = isValidDisplayTypeForDimensionBreakout(
    draft.display,
    breakoutType,
  )
    ? draft.display
    : getDimensionBreakoutConfig(breakoutType).defaultDisplayType;

  return { series: draft.series, dimensionKeys, display };
}
