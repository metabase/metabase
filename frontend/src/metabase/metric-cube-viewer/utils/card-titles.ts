import { t } from "ttag";

import type { CubeCard, CubeCatalog, CubeSeries } from "../types";

export function getCardTitle(card: CubeCard, catalog: CubeCatalog): string {
  const measureName = getMeasureName(card.series[0], catalog);
  const segmentName = getSegmentNames(card.series[0], catalog);
  const [dimension, secondDimension] = card.dimensionKeys.map((key) =>
    getDimensionLabel(key, catalog),
  );

  switch (card.kind) {
    case "overview":
      return measureName;
    case "single":
      return t`${measureName} by ${dimension}`;
    case "time-by-category":
      return t`${measureName} by ${dimension} and ${secondDimension}`;
    case "by-segment":
      return t`${measureName} by segment`;
    case "segment-vs-total": {
      const segmented = card.series.find((s) => s.segmentIds.length > 0);
      const segment = segmented ? getSegmentNames(segmented, catalog) : "";
      return t`${measureName}: ${segment} vs. all`;
    }
    case "segmented-single":
      return t`${measureName} (${segmentName}) by ${dimension}`;
    case "custom":
      return getCustomTitle(card, catalog);
  }
}

function getCustomTitle(card: CubeCard, catalog: CubeCatalog): string {
  const seriesNames = card.series
    .map((series) => {
      const measureName = getMeasureName(series, catalog);
      const segmentNames = getSegmentNames(series, catalog);
      return segmentNames ? `${measureName} (${segmentNames})` : measureName;
    })
    .join(", ");
  if (card.dimensionKeys.length === 0) {
    return seriesNames;
  }
  const dimensions = card.dimensionKeys
    .map((key) => getDimensionLabel(key, catalog))
    .join(", ");
  return t`${seriesNames} by ${dimensions}`;
}

function getMeasureName(
  series: CubeSeries | undefined,
  catalog: CubeCatalog,
): string {
  return (
    catalog.measures.find((measure) => measure.id === series?.measureId)
      ?.name ?? ""
  );
}

function getSegmentNames(
  series: CubeSeries | undefined,
  catalog: CubeCatalog,
): string {
  return (series?.segmentIds ?? [])
    .flatMap((segmentId) => {
      const segment = catalog.segments.find((s) => s.id === segmentId);
      return segment ? [segment.name] : [];
    })
    .join(", ");
}

function getDimensionLabel(key: string, catalog: CubeCatalog): string {
  return (
    catalog.dimensions.find((dimension) => dimension.key === key)?.label ?? key
  );
}
