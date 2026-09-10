import {
  DEFAULT_DISPLAY_BY_TYPE,
  isLowCardinality,
  makeCard,
  overviewCard,
  resolveSettings,
} from "../shared";
import type {
  CubeCard,
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
  CubeDimensionKey,
  CubeMeasure,
  CubeSegment,
  CubeSeries,
  MetricsViewerDisplayType,
} from "../types";

import {
  BASE_CARD_BUDGET,
  DIMENSION_REPEAT_PENALTY,
  FEATURED_KINDS,
  KIND_CAPS,
  KIND_PRIOR,
  LAYOUT_KIND_ORDER,
  LAYOUT_TYPE_ORDER,
  LOW_CARDINALITY_MAX,
  MAX_CARDS_PER_DIMENSION,
  MAX_CARD_BUDGET,
  MAX_SEGMENTS,
  MEASURE_DECAY,
  MEASURE_REPEAT_PENALTY,
  MIN_CARD_SCORE,
  SEGMENT_DECAY,
  type ScoredKind,
  TYPE_PRIOR,
} from "./constants";
import { compareDimensions, rankMeasures } from "./ranking";

interface Candidate {
  card: CubeCard;
  kind: ScoredKind;
  measureId: CubeMeasure["id"];
  baseScore: number;
}

export function generateCards(
  catalog: CubeCatalog,
  settings: CubeCoarseSettings,
): CubeCard[] {
  const rankById = new Map(rankMeasures(catalog).map((m, i) => [m.id, i]));
  const resolved = resolveSettings(
    catalog,
    settings.measureIds,
    settings.dimensionKeys,
  );
  const measures = resolved.measures.sort(
    (a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0),
  );
  const dimensions = resolved.dimensions.sort(compareDimensions);
  const segments = catalog.segments.slice(0, MAX_SEGMENTS);

  const candidates = enumerateCandidates(measures, dimensions, segments);
  const picked = pickCards(candidates, measures, dimensions);
  const dimensionByKey = new Map(catalog.dimensions.map((d) => [d.key, d]));

  return [
    ...measures.map(overviewCard),
    ...sortForLayout(picked, dimensionByKey),
  ];
}

// ── Candidates ──

function enumerateCandidates(
  measures: CubeMeasure[],
  dimensions: CubeDimension[],
  segments: CubeSegment[],
): Candidate[] {
  const timeDimensions = dimensions.filter((d) => d.type === "time");
  const lowCardinalityDimensions = dimensions.filter((d) =>
    isLowCardinality(d, LOW_CARDINALITY_MAX),
  );

  return measures.flatMap((measure, measureIndex) => {
    const measureWeight = Math.pow(MEASURE_DECAY, measureIndex);
    const supported = dimensions.filter(
      (d) => measure.dimensionIds[d.key] != null,
    );
    const total: CubeSeries = { measureId: measure.id, segmentIds: [] };

    const candidate = (
      kind: ScoredKind,
      series: CubeSeries[],
      dimensionKeys: CubeDimensionKey[],
      display: MetricsViewerDisplayType,
      score: number,
    ): Candidate => ({
      card: makeCard(kind, series, dimensionKeys, display),
      kind,
      measureId: measure.id,
      baseScore: score * measureWeight,
    });

    // [measure by dimension]
    const singles = supported.map((d) =>
      candidate(
        "single",
        [total],
        [d.key],
        DEFAULT_DISPLAY_BY_TYPE[d.type],
        KIND_PRIOR.single * d.score * TYPE_PRIOR[d.type],
      ),
    );

    // [measure by time × low-cardinality category]
    const timeByCategory = timeDimensions
      .filter((time) => supported.includes(time))
      .flatMap((time) =>
        lowCardinalityDimensions
          .filter((category) => supported.includes(category))
          .map((category) =>
            candidate(
              "time-by-category",
              [total],
              [time.key, category.key],
              "line",
              KIND_PRIOR["time-by-category"] *
                Math.sqrt(time.score * category.score) *
                TYPE_PRIOR.time,
            ),
          ),
      );

    // [measure, measure | s1, measure | s2, …] — renders as bars
    const bySegment =
      segments.length > 0
        ? [
            candidate(
              "by-segment",
              [
                total,
                ...segments.map((s) => ({
                  measureId: measure.id,
                  segmentIds: [s.id],
                })),
              ],
              [],
              "scalar",
              KIND_PRIOR["by-segment"],
            ),
          ]
        : [];

    const perSegment = segments.flatMap((segment, segmentIndex) => {
      const segmentWeight = Math.pow(SEGMENT_DECAY, segmentIndex);
      const segmented: CubeSeries = {
        measureId: measure.id,
        segmentIds: [segment.id],
      };

      // [measure, measure | segment by time] — additive measures only
      const segmentVsTotal = measure.isAdditive
        ? timeDimensions
            .filter((time) => supported.includes(time))
            .map((time) =>
              candidate(
                "segment-vs-total",
                [total, segmented],
                [time.key],
                "line",
                KIND_PRIOR["segment-vs-total"] * time.score * segmentWeight,
              ),
            )
        : [];

      // [measure | segment by dimension]
      const segmentedSingles = supported.map((d) =>
        candidate(
          "segmented-single",
          [segmented],
          [d.key],
          DEFAULT_DISPLAY_BY_TYPE[d.type],
          KIND_PRIOR["segmented-single"] *
            d.score *
            TYPE_PRIOR[d.type] *
            segmentWeight,
        ),
      );

      return [...segmentVsTotal, ...segmentedSingles];
    });

    return [...singles, ...timeByCategory, ...bySegment, ...perSegment];
  });
}

// ── Picking ──

function pickCards(
  candidates: Candidate[],
  measures: CubeMeasure[],
  dimensions: CubeDimension[],
): CubeCard[] {
  const picked: Candidate[] = [];
  const remaining = new Set(candidates);

  const isUnderKindCap = (c: Candidate) => {
    const cap = KIND_CAPS[c.kind];
    if (cap != null && picked.filter((p) => p.kind === c.kind).length >= cap) {
      return false;
    }
    if (c.kind === "segment-vs-total") {
      return !picked.some(
        (p) => p.kind === c.kind && p.measureId === c.measureId,
      );
    }
    return true;
  };

  const effectiveScore = (c: Candidate) => {
    const sameMeasure = picked.filter(
      (p) => p.measureId === c.measureId,
    ).length;
    // Only same-kind cards count, so featured cards don't push out plain
    // "measure by dimension" cards that share their dimension.
    const sharedDimensions = picked.filter(
      (p) =>
        p.kind === c.kind &&
        p.card.dimensionKeys.some((k) => c.card.dimensionKeys.includes(k)),
    ).length;
    return (
      c.baseScore *
      Math.pow(MEASURE_REPEAT_PENALTY, sameMeasure) *
      Math.pow(DIMENSION_REPEAT_PENALTY, sharedDimensions)
    );
  };

  const best = (filter: (c: Candidate) => boolean) => {
    let top: Candidate | null = null;
    let topScore = -Infinity;
    for (const c of remaining) {
      if (!filter(c) || !isUnderKindCap(c)) {
        continue;
      }
      const score = effectiveScore(c);
      const isTieWinner =
        score === topScore && top != null && c.card.id < top.card.id;
      if (score > topScore || isTieWinner) {
        top = c;
        topScore = score;
      }
    }
    return top != null && topScore >= MIN_CARD_SCORE ? top : null;
  };

  const take = (c: Candidate | null) => {
    if (c) {
      picked.push(c);
      remaining.delete(c);
    }
  };

  // Pass 1 — featured: one of each richer kind, when a candidate exists.
  for (const kind of FEATURED_KINDS) {
    take(best((c) => c.kind === kind));
  }

  // Pass 2 — coverage: each selected measure and dimension gets a "single" card.
  const isSingle = (c: Candidate) => c.kind === "single";
  for (const measure of measures) {
    if (!picked.some((p) => isSingle(p) && p.measureId === measure.id)) {
      take(best((c) => isSingle(c) && c.measureId === measure.id));
    }
  }
  for (const dimension of dimensions) {
    const isOnXAxis = (c: Candidate) =>
      isSingle(c) && c.card.dimensionKeys[0] === dimension.key;
    if (!picked.some(isOnXAxis)) {
      take(best(isOnXAxis));
    }
  }

  // Pass 3 — fill by score, spreading x-axis dimensions.
  const budget = Math.min(
    MAX_CARD_BUDGET,
    Math.max(BASE_CARD_BUDGET, picked.length),
  );
  const isUnderDimensionCap = (c: Candidate) => {
    const [xAxis] = c.card.dimensionKeys;
    return (
      xAxis == null ||
      picked.filter((p) => p.card.dimensionKeys[0] === xAxis).length <
        MAX_CARDS_PER_DIMENSION
    );
  };
  while (picked.length < budget) {
    const next = best(isUnderDimensionCap);
    if (!next) {
      break;
    }
    take(next);
  }

  return picked.map((p) => p.card);
}

// ── Layout ──

function sortForLayout(
  cards: CubeCard[],
  dimensionByKey: Map<CubeDimensionKey, CubeDimension>,
): CubeCard[] {
  const typeIndex = (card: CubeCard) => {
    const [firstKey] = card.dimensionKeys;
    const dimension = firstKey ? dimensionByKey.get(firstKey) : undefined;
    return dimension ? LAYOUT_TYPE_ORDER.indexOf(dimension.type) : -1;
  };
  // Stable sort keeps pick order (score) within a group.
  return [...cards].sort(
    (a, b) =>
      LAYOUT_KIND_ORDER.indexOf(a.kind) - LAYOUT_KIND_ORDER.indexOf(b.kind) ||
      typeIndex(a) - typeIndex(b),
  );
}
