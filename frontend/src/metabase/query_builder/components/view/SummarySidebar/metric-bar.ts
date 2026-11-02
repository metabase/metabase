import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { type SummarySession, getSummaryQuestion } from "./summary-session";
import type { SummaryBase, SummaryValue } from "./types";
import {
  buildSummaryQuery,
  createItemId,
  getItemLabels,
  removeItem,
} from "./utils";

/** A summary value as the metric bar shows it: saved metrics as metric pills, everything else as ad-hoc pills. */
export type MetricBarItem = {
  valueId: string;
  label: string;
  /** The saved metric the value aggregates; `null` for counts and column aggregations. */
  metricId: number | null;
};

function getMetricId(
  { query, stageIndex }: SummaryBase,
  metric: Lib.MetricMetadata,
): number | null {
  const ref: unknown = Lib.legacyRef(query, stageIndex, metric);
  if (!Array.isArray(ref) || ref[0] !== "metric") {
    return null;
  }
  const id: unknown = ref[ref.length - 1];
  return typeof id === "number" ? id : null;
}

function getValueMetricId(
  base: SummaryBase,
  value: SummaryValue,
): number | null {
  return value.type === "metric" ? getMetricId(base, value.metric) : null;
}

/** The session's values, in order, with the labels the summary sidebar shows for them. */
export function getMetricBarItems({
  base,
  definition,
}: SummarySession): MetricBarItem[] {
  const labels = getItemLabels(
    base,
    definition,
    buildSummaryQuery(base, definition),
  );
  return definition.values.map((value) => ({
    valueId: value.id,
    label: labels.get(value.id) ?? "",
    metricId: getValueMetricId(base, value),
  }));
}

/**
 * The question with exactly `metricIds` as its saved-metric values: values for metrics no
 * longer listed are removed, new metrics are appended, and other values stay in place.
 * `unavailableIds` lists metrics that can't aggregate the summary's data.
 */
export function withMetricBarMetrics(
  session: SummarySession,
  metricIds: number[],
): { question: Question | null; unavailableIds: number[] } {
  const { base, definition } = session;
  const keptValues = definition.values.filter((value) => {
    const metricId = getValueMetricId(base, value);
    return metricId == null || metricIds.includes(metricId);
  });
  const keptMetricIds = keptValues.map((value) =>
    getValueMetricId(base, value),
  );
  const availableMetrics = Lib.availableMetrics(base.query, base.stageIndex);
  const unavailableIds: number[] = [];
  const addedValues = metricIds
    .filter((metricId) => !keptMetricIds.includes(metricId))
    .flatMap((metricId): SummaryValue[] => {
      const metric = availableMetrics.find(
        (metric) => getMetricId(base, metric) === metricId,
      );
      if (metric == null) {
        unavailableIds.push(metricId);
        return [];
      }
      return [{ id: createItemId(), type: "metric", metric }];
    });

  return {
    question: getSummaryQuestion({
      ...session,
      definition: { ...definition, values: [...keptValues, ...addedValues] },
    }),
    unavailableIds,
  };
}

/** The question without the value `valueId`. */
export function withoutMetricBarItem(
  session: SummarySession,
  valueId: string,
): Question | null {
  return getSummaryQuestion({
    ...session,
    definition: removeItem(session.definition, valueId),
  });
}
