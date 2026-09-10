import type { CardDisplayType } from "metabase-types/api";

import { CAPS, K, THRESH } from "./constants";
import { ALL_CHANNELS } from "./mapping";
import { byCardinality, cardinalityOf } from "./shape";
import type {
  Candidate,
  ColumnMapping,
  ColumnProfile,
  DisplayVariant,
  Shape,
} from "./types";

export function mappingKey(mapping: ColumnMapping): string {
  return ALL_CHANNELS.filter((channel) => mapping[channel] != null)
    .map((channel) => `${channel}=${(mapping[channel] ?? []).join(",")}`)
    .join("|");
}

export function candidateId(
  display: CardDisplayType,
  variant: DisplayVariant | null,
  mapping: ColumnMapping,
): string {
  return `${display}:${variant ?? "-"}:${mappingKey(mapping)}`;
}

export function makeCandidate(
  display: CardDisplayType,
  variant: DisplayVariant | null,
  mapping: ColumnMapping,
): Candidate {
  return {
    id: candidateId(display, variant, mapping),
    display,
    variant,
    mapping,
  };
}

const indices = (profiles: ColumnProfile[]): number[] =>
  profiles.map((profile) => profile.index);

function tableCandidates(shape: Shape, dims: ColumnProfile[]): Candidate[] {
  const candidates = [makeCandidate("table", null, {})];
  const [firstMeasure] = shape.M;
  if (firstMeasure && shape.aggregated && dims.length >= 1) {
    candidates.push(
      makeCandidate("table", "mini-bar", { metrics: [firstMeasure.index] }),
    );
  }
  if (firstMeasure && shape.isNative && dims.length === 2) {
    const [series, axis] = dims;
    candidates.push(
      makeCandidate("table", "table-pivot", {
        x: [axis.index],
        series: [series.index],
        metrics: [firstMeasure.index],
      }),
    );
  }
  if (!shape.aggregated && shape.K.length > 0) {
    candidates.push(makeCandidate("object", "object", {}));
  }
  return candidates;
}

function scalarCandidates(
  shape: Shape,
  profiles: ColumnProfile[],
): Candidate[] {
  if (shape.M.length > 0) {
    return shape.M.slice(0, K.K1_SCALAR_MAX_MEASURES).map((measure) =>
      makeCandidate("scalar", null, { scalarField: [measure.index] }),
    );
  }
  const [only] = profiles;
  return profiles.length === 1 && only
    ? [makeCandidate("scalar", null, { scalarField: [only.index] })]
    : [];
}

function smartScalarCandidates(shape: Shape): Candidate[] {
  const [time] = shape.Dt;
  const [measure] = shape.M;
  if (
    !time ||
    !measure ||
    shape.Dt.length !== 1 ||
    shape.M.length !== 1 ||
    shape.D.length !== 1
  ) {
    return [];
  }
  return [
    makeCandidate("smartscalar", null, {
      x: [time.index],
      metrics: [measure.index],
    }),
  ];
}

function singleAxisCartesian(shape: Shape, axis: ColumnProfile): Candidate[] {
  const metrics = indices(shape.M);
  const multi = shape.M.length >= 2;
  const mapping = { x: [axis.index], metrics };
  const candidates = [
    makeCandidate("line", null, mapping),
    makeCandidate("area", null, mapping),
    makeCandidate("bar", null, mapping),
    makeCandidate("row", null, mapping),
  ];
  if (multi) {
    candidates.push(
      makeCandidate("line", "auto-split", mapping),
      makeCandidate("area", "stacked", mapping),
      makeCandidate("area", "normalized", mapping),
      makeCandidate("bar", "grouped", mapping),
      makeCandidate("row", "grouped", mapping),
      makeCandidate("combo", null, mapping),
    );
  }
  return candidates;
}

function seriesCartesian(
  shape: Shape,
  axis: ColumnProfile,
  series: ColumnProfile,
): Candidate[] {
  const [firstMeasure] = shape.M;
  if (!firstMeasure) {
    return [];
  }
  const mapping = {
    x: [axis.index],
    series: [series.index],
    metrics: [firstMeasure.index],
  };
  return [
    makeCandidate("line", null, mapping),
    makeCandidate("area", "stacked", mapping),
    makeCandidate("area", "normalized", mapping),
    makeCandidate("bar", "stacked", mapping),
    makeCandidate("bar", "normalized", mapping),
    makeCandidate("bar", "grouped", mapping),
    makeCandidate("row", "stacked", mapping),
    makeCandidate("row", "grouped", mapping),
  ];
}

function cartesianCandidates(shape: Shape, dims: ColumnProfile[]): Candidate[] {
  if (shape.M.length === 0) {
    return [];
  }
  return dims.flatMap((axis) => [
    ...singleAxisCartesian(shape, axis),
    ...dims
      .filter((series) => series.index !== axis.index)
      .flatMap((series) => seriesCartesian(shape, axis, series)),
  ]);
}

function aggregatedScatter(shape: Shape): Candidate[] {
  const [firstMeasure, secondMeasure] = shape.M;
  if (!firstMeasure) {
    return [];
  }
  return shape.Dnum.map((axis) =>
    makeCandidate("scatter", null, {
      x: [axis.index],
      metrics: [firstMeasure.index],
      ...(secondMeasure ? { bubble: [secondMeasure.index] } : {}),
    }),
  );
}

function rawScatter(shape: Shape): Candidate[] {
  const [xMeasure, yMeasure, bubbleMeasure] = shape.M;
  if (!xMeasure || !yMeasure || shape.D.length > 1) {
    return [];
  }
  const [dim] = shape.D;
  const dimCard = dim ? cardinalityOf(dim) : null;
  const series =
    dim && dimCard != null && dimCard <= THRESH.SCATTER_COLOR_MAX_CARD;
  return [
    makeCandidate("scatter", null, {
      x: [xMeasure.index],
      metrics: [yMeasure.index],
      ...(bubbleMeasure ? { bubble: [bubbleMeasure.index] } : {}),
      ...(series && dim ? { series: [dim.index] } : {}),
    }),
  ];
}

function scatterCandidates(shape: Shape): Candidate[] {
  return shape.aggregated ? aggregatedScatter(shape) : rawScatter(shape);
}

function singleDimMetricCandidates(
  display: CardDisplayType,
  shape: Shape,
  dims: ColumnProfile[],
): Candidate[] {
  const [firstMeasure] = shape.M;
  if (!firstMeasure) {
    return [];
  }
  return dims.map((dim) =>
    makeCandidate(display, null, {
      x: [dim.index],
      metrics: [firstMeasure.index],
    }),
  );
}

function latLon(
  shape: Shape,
): { lat: ColumnProfile; lon: ColumnProfile } | null {
  const lat = shape.Glatlon.find((geo) => geo.geo?.kind === "lat");
  const lon = shape.Glatlon.find((geo) => geo.geo?.kind === "lon");
  return lat && lon ? { lat, lon } : null;
}

function mapCandidates(shape: Shape): Candidate[] {
  const [firstMeasure] = shape.M;
  const candidates: Candidate[] = [];
  if (firstMeasure) {
    for (const region of shape.Gregion) {
      candidates.push(
        makeCandidate("map", "region", {
          region: [region.index],
          metrics: [firstMeasure.index],
        }),
      );
    }
  }
  const coords = latLon(shape);
  if (coords) {
    const base = { lat: [coords.lat.index], lon: [coords.lon.index] };
    candidates.push(
      makeCandidate("map", "pin", {
        ...base,
        ...(firstMeasure && shape.aggregated
          ? { metrics: [firstMeasure.index] }
          : {}),
      }),
    );
    if (firstMeasure) {
      candidates.push(
        makeCandidate("map", "grid", {
          ...base,
          metrics: [firstMeasure.index],
        }),
      );
    }
  }
  return candidates;
}

export function pivotSplit(dims: ColumnProfile[]): {
  columns: ColumnProfile[];
  rows: ColumnProfile[];
} {
  const sorted = [...dims].sort(byCardinality);
  const columnCount = sorted.length >= 4 ? 2 : 1;
  return {
    columns: sorted.slice(0, columnCount),
    rows: sorted.slice(columnCount),
  };
}

function pivotCandidates(shape: Shape): Candidate[] {
  if (!shape.aggregated || shape.D.length < 2 || shape.M.length === 0) {
    return [];
  }
  const { columns, rows } = pivotSplit(shape.D);
  return [
    makeCandidate("pivot", null, {
      pivotColumns: indices(columns),
      pivotRows: indices(rows),
      metrics: indices(shape.M),
    }),
  ];
}

function flowCandidates(shape: Shape): Candidate[] {
  const [firstMeasure] = shape.M;
  if (
    !firstMeasure ||
    shape.M.length !== 1 ||
    shape.D.length < 1 ||
    shape.D.length > 2
  ) {
    return [];
  }
  const [first, second] = shape.D;
  const candidates: Candidate[] = [];
  if (first && second) {
    candidates.push(
      makeCandidate("sankey", null, {
        source: [first.index],
        target: [second.index],
        value: [firstMeasure.index],
      }),
    );
  }
  if (first) {
    candidates.push(
      makeCandidate("treemap", null, {
        grouping: [first.index],
        ...(second ? { subGrouping: [second.index] } : {}),
        value: [firstMeasure.index],
      }),
    );
  }
  return candidates;
}

export function enumerateCandidates(
  shape: Shape,
  profiles: ColumnProfile[],
): Candidate[] {
  const dims = [...shape.D]
    .sort(byCardinality)
    .slice(0, CAPS.MAX_ENUMERATED_DIMS);
  return [
    ...tableCandidates(shape, dims),
    ...scalarCandidates(shape, profiles),
    ...smartScalarCandidates(shape),
    ...cartesianCandidates(shape, dims),
    ...scatterCandidates(shape),
    ...singleDimMetricCandidates("pie", shape, dims),
    ...singleDimMetricCandidates("funnel", shape, dims),
    ...mapCandidates(shape),
    ...pivotCandidates(shape),
    ...flowCandidates(shape),
  ];
}
