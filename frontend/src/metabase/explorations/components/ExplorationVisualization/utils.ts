import { TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import { createSeriesCard } from "metabase/metrics/utils/series";
import { isCartesianChart } from "metabase/visualizations";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { isCountry, isDate, isState } from "metabase-lib/v1/types/utils/isa";
import type {
  CardDisplayType,
  CardId,
  Dataset,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationThread,
  ExplorationThreadMetric,
  SingleSeries,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";

interface BuildSeriesGroupsParams {
  queries: ExplorationQuery[];
  datasets: Dataset[];
  metricsById: Map<CardId, ExplorationThreadMetric>;
  queryColors: Record<string, string>;
}

interface SeriesGroup {
  series: SingleSeries[];
  isTimeseries: boolean;
}

export function buildSeriesGroups({
  queries,
  datasets,
  ...rest
}: BuildSeriesGroupsParams): SeriesGroup[] {
  const queriesWithDatasetGroups = groupQueriesWithDatasets({
    queries,
    datasets,
  });
  return queriesWithDatasetGroups.map((queriesWithDatasets) =>
    buildSeries({ ...rest, queriesWithDatasets }),
  );
}

interface ExplorationQueryWithDataset extends ExplorationQuery {
  dataset: Dataset;
}

function groupQueriesWithDatasets({
  queries,
  datasets,
}: Pick<
  BuildSeriesGroupsParams,
  "queries" | "datasets"
>): ExplorationQueryWithDataset[][] {
  const groups: Record<string, ExplorationQueryWithDataset[]> = {};
  queries.forEach((query, i) => {
    const key = `${query.dimension_id}-${query.query_type}`;
    let group = groups[key];
    if (!group) {
      group = [];
      groups[key] = group;
    }
    group.push({ ...query, dataset: datasets[i] });
  });
  return Object.values(groups);
}

type BuildSeriesParams = Omit<
  BuildSeriesGroupsParams,
  "queries" | "datasets"
> & {
  queriesWithDatasets: ExplorationQueryWithDataset[];
};

export function buildSeries({
  queriesWithDatasets,
  metricsById,
  queryColors,
}: BuildSeriesParams): SeriesGroup {
  let isTimeseries = false;

  const series = queriesWithDatasets.map((queryWithDataset) => {
    const { dataset, ...query } = queryWithDataset;
    const {
      display,
      settings,
      isTimeseries: isTimeseriesForQuery,
    } = getDisplay(queryWithDataset);
    isTimeseries = isTimeseries || Boolean(isTimeseriesForQuery);
    const isCartesian = isCartesianChart(display);
    const cardSettings: VisualizationSettings = { ...settings };
    if (isCartesian) {
      cardSettings["graph.split_panels"] = true; // Render every series in its own vertical pane along a shared x-axis
      cardSettings["graph.y_axis.title_text"] = metricsById.get(
        query.card_id,
      )?.card?.name;
    } else if (display === "map") {
      const color = queryColors[String(query.id)];
      if (color) {
        cardSettings["map.colors"] = getColorplethColorScale(color);
      }
    }
    const card = createSeriesCard(query.id, query.name, display, cardSettings);
    return { card, data: dataset.data };
  });

  return { series, isTimeseries };
}

function getDisplay(queryWithDataset: ExplorationQueryWithDataset): {
  display: CardDisplayType;
  settings?: VisualizationSettings;
  isTimeseries?: boolean;
} {
  const cols = queryWithDataset.dataset.data.cols;
  const isTimeseries = cols.some(isDate);

  if (cols.length === 3 && isTimeseries) {
    // The second column is the date column and should be the x-axis;
    // the first column is the breakout. Provide them explicitly,
    // otherwise viz settings might swap them based on cardinality.
    const dimensions = [cols[1]?.name, cols[0]?.name].filter(
      (name): name is string => typeof name === "string",
    );
    return {
      display: "line",
      settings: { "graph.dimensions": dimensions },
      isTimeseries,
    };
  }

  if (isTimeseries) {
    return { display: "line", isTimeseries };
  }

  if (cols.length === 2 && isState(cols[0])) {
    return {
      display: "map",
      settings: { "map.type": "region", "map.region": "us_states" },
    };
  }

  if (cols.length === 2 && isCountry(cols[0])) {
    return {
      display: "map",
      settings: { "map.type": "region", "map.region": "world_countries" },
    };
  }

  return { display: "bar" };
}

/**
 * Aggregates `timeline_interestingness` across queries by taking the max
 * score per timeline. Used by group pages so a timeline counts as
 * interesting if any sub-query finds it interesting.
 *
 * Queries without `timeline_interestingness` (BE may omit the field) and
 * entries with `null` scores are ignored.
 */
export function getMaxTimelineInterestingness(
  queries: ExplorationQuery[],
): Map<TimelineId, number> {
  const map = new Map<TimelineId, number>();
  for (const q of queries) {
    for (const e of q.timeline_interestingness ?? []) {
      if (e.interestingness_score == null) {
        continue;
      }
      const prev = map.get(e.timeline_id);
      if (prev == null || e.interestingness_score > prev) {
        map.set(e.timeline_id, e.interestingness_score);
      }
    }
  }
  return map;
}

/**
 * Set of timeline ids whose max-aggregated score across `queries` passes
 * the global interestingness threshold (see `metabase/explorations/constants`).
 * Used by `TimelineDropdown` to decide which items get the
 * `PotentiallyInterestingMarker`.
 */
export function getInterestingTimelineIds(
  queries: ExplorationQuery[],
): ReadonlySet<TimelineId> {
  const result = new Set<TimelineId>();
  for (const [id, score] of getMaxTimelineInterestingness(queries)) {
    if (score >= TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Picks the most-interesting timeline for `queries` restricted to the
 * timelines actually available in the dropdown. Returns `null` when no
 * candidate passes the threshold or when no scored timeline is available.
 *
 * Drives the auto-default selection on threads where the user hasn't
 * manually picked a timeline yet.
 */
export function getMostInterestingTimelineId(
  queries: ExplorationQuery[],
  availableTimelineIds: ReadonlySet<TimelineId>,
): TimelineId | null {
  if (availableTimelineIds.size === 1) {
    const id = availableTimelineIds.values().next().value;
    if (id) {
      return id;
    }
  }

  let best: { id: TimelineId; score: number } | null = null;
  for (const [id, score] of getMaxTimelineInterestingness(queries)) {
    if (!availableTimelineIds.has(id)) {
      continue;
    }
    if (score < TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD) {
      continue;
    }
    if (best == null || score > best.score) {
      best = { id, score };
    }
  }
  return best?.id ?? null;
}

export function getDocumentsForDocumentMenu(
  explorationThread: ExplorationThread,
): ExplorationDocument[] {
  return (explorationThread.documents ?? []).filter(
    (d) => d.id !== explorationThread.auto_insights_document_id,
  );
}
