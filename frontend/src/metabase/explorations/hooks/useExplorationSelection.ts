import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from "react";

import { useListTimelinesQuery } from "metabase/api";
import {
  getDefaultExplorationName,
  isInterestingDimension,
} from "metabase/explorations/constants";
import type { ExplorationMetric } from "metabase/explorations/types";
import type {
  DimensionId,
  ExplorationDimensionGroup,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import { removeMetricFromSelection } from "../components/NewExplorationData/utils";

/**
 * Shared add-metric logic used by both `addMetric` and the add branch of
 * `toggleMetric`. Meant to be called inside a `setMetrics` updater so it
 * has a consistent view of `prevMetrics`. Returns the next metrics array.
 *
 * Side-effects: enqueues a `setDimensions` update for the metric's
 * "interesting" dimensions (falling back to all referenced dimensions
 * when none are interesting so the user always gets a non-empty default).
 */
function applyAddMetric(
  metric: ExplorationMetric,
  dimensionsById: Map<DimensionId, MetricDimension>,
  prevMetrics: ExplorationMetric[],
  setDimensions: Dispatch<SetStateAction<MetricDimension[]>>,
): ExplorationMetric[] {
  if (prevMetrics.some((m) => m.id === metric.id)) {
    return prevMetrics;
  }

  const referencedDims = metric.dimension_ids
    .map((id) => dimensionsById.get(id))
    .filter((d): d is MetricDimension => d != null);
  const hasInteresting = referencedDims.some(isInterestingDimension);
  const additions = hasInteresting
    ? referencedDims.filter(isInterestingDimension)
    : referencedDims;

  setDimensions((prevDimensions) => {
    const have = new Set(prevDimensions.map((d) => d.id));
    const merged = [...prevDimensions];
    for (const d of additions) {
      if (!have.has(d.id)) {
        merged.push(d);
        have.add(d.id);
      }
    }
    return merged.length === prevDimensions.length ? prevDimensions : merged;
  });

  return [...prevMetrics, metric];
}

/**
 * Context the `toggleMetric` helper needs to apply the auto-toggle rule
 * (selecting a metric auto-adds its "interesting" dimensions to the
 * exploration). Callers compute it from the currently visible
 * `/api/exploration/dimensions` response.
 */
export interface ToggleMetricContext {
  /** Flat map of every dimension across every group currently visible. */
  dimensionsById: Map<DimensionId, MetricDimension>;
}

/**
 * Context the `toggleDimension` helper needs to:
 *   - cascade selection across every dimension in the row's group, and
 *   - drop any metric that loses its last matching dimension on removal.
 *
 * The `group` matches what `groupByRowId.get(dimension.id)` returns in
 * the Browse Dimensions panel — the structural source of truth for
 * "which dimensions does this picker row stand in for".
 */
export interface ToggleDimensionContext {
  /** The group this dimension row represents. `null` if the row is a
   *  bare dimension (no group siblings). */
  group: ExplorationDimensionGroup | null;
  /** Map from dimension id → metrics that reference that dimension. */
  metricsByDimension: Map<DimensionId, ExplorationMetric[]>;
}

export interface ExplorationSelection {
  metrics: ExplorationMetric[];
  dimensions: MetricDimension[];
  timelines: Timeline[];
  /** All timelines from the API (includes events). */
  allTimelines: Timeline[];
  timelinesLoading: boolean;
  timelinesError: unknown;
  name: string;

  setName: Dispatch<SetStateAction<string>>;

  /** Direct state setters for cases that need full control over the array. */
  setMetrics: Dispatch<SetStateAction<ExplorationMetric[]>>;
  setDimensions: Dispatch<SetStateAction<MetricDimension[]>>;
  setTimelines: Dispatch<SetStateAction<Timeline[]>>;

  /**
   * Add a metric if not already selected. Auto-adds its "interesting"
   * dimensions (falling back to all referenced dimensions when none are
   * interesting). No-op when the metric is already in the selection.
   */
  addMetric: (metric: ExplorationMetric, context: ToggleMetricContext) => void;

  /**
   * Toggle a metric. Adds the metric + its interesting dimensions if it
   * was unselected; removes the metric + drops dimensions that become
   * orphaned (no other selected metric still uses them). Idempotent.
   */
  toggleMetric: (
    metric: ExplorationMetric,
    context: ToggleMetricContext,
  ) => void;
  /**
   * Toggle a dimension picker row. Cascades selection across every
   * dimension in the row's group, and drops any selected metric that
   * loses its last matching dimension on removal.
   */
  toggleDimension: (
    dimension: MetricDimension,
    context: ToggleDimensionContext,
  ) => void;
  toggleTimeline: (timeline: Timeline) => void;
  /** Resolve ids against `allTimelines` and merge into the selection. Idempotent. */
  addTimelinesById: (timelineIds: number[]) => void;
}

/**
 * Owns the lifted state for `/question/research`'s new-exploration page:
 * metrics, dimensions, timelines, and the exploration name. Returns
 * granular `toggle…` helpers that bake in the bidirectional metric ↔
 * dimension auto-toggle rules, so the Browse tab and the agent chat
 * share one source of truth and stay in sync.
 */
export function useExplorationSelection(): ExplorationSelection {
  const [metrics, setMetrics] = useState<ExplorationMetric[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string>(getDefaultExplorationName());

  const {
    data: allTimelines = [],
    isLoading: timelinesLoading,
    error: timelinesError,
  } = useListTimelinesQuery({ include: "events" });

  const addMetric = useCallback(
    (metric: ExplorationMetric, { dimensionsById }: ToggleMetricContext) => {
      setMetrics((prevMetrics) =>
        applyAddMetric(metric, dimensionsById, prevMetrics, setDimensions),
      );
    },
    [],
  );

  const toggleMetric = useCallback(
    (metric: ExplorationMetric, { dimensionsById }: ToggleMetricContext) => {
      setMetrics((prevMetrics) => {
        if (prevMetrics.some((m) => m.id === metric.id)) {
          setDimensions((prevDimensions) => {
            const { dimensions: nextDimensions } = removeMetricFromSelection(
              prevMetrics,
              prevDimensions,
              metric.id,
            );
            return nextDimensions;
          });
          return prevMetrics.filter((m) => m.id !== metric.id);
        }
        return applyAddMetric(
          metric,
          dimensionsById,
          prevMetrics,
          setDimensions,
        );
      });
    },
    [],
  );

  const toggleDimension = useCallback(
    (
      dimension: MetricDimension,
      { group, metricsByDimension }: ToggleDimensionContext,
    ) => {
      const groupDims = group?.dimensions ?? [dimension];
      const groupIds = new Set(groupDims.map((d) => d.id));
      const connectedMetrics = groupDims.flatMap(
        (d) => metricsByDimension.get(d.id) ?? [],
      );

      setDimensions((prevDimensions) => {
        const isAnySelected = groupDims.some((d) =>
          prevDimensions.some((sel) => sel.id === d.id),
        );

        if (isAnySelected) {
          // Removing: drop every dimension in the group, then remove any
          // selected metric that loses its last matching dimension.
          const nextDimensions = prevDimensions.filter(
            (d) => !groupIds.has(d.id),
          );
          const remainingDimIds = new Set(nextDimensions.map((d) => d.id));
          const orphanedIds = new Set(
            connectedMetrics
              .filter(
                (m) => !m.dimension_ids.some((id) => remainingDimIds.has(id)),
              )
              .map((m) => m.id),
          );
          if (orphanedIds.size > 0) {
            setMetrics((prevMetrics) =>
              prevMetrics.filter((m) => !orphanedIds.has(m.id)),
            );
          }
          return nextDimensions;
        }

        // Adding: merge in every dimension in the group, then ensure any
        // metric that references one of those dimensions is also
        // selected (so the picker can't end up with a dangling
        // dimension that has no matching metric).
        const have = new Set(prevDimensions.map((d) => d.id));
        const mergedDims = [...prevDimensions];
        for (const d of groupDims) {
          if (!have.has(d.id)) {
            mergedDims.push(d);
            have.add(d.id);
          }
        }
        if (connectedMetrics.length > 0) {
          setMetrics((prevMetrics) => {
            const haveMetrics = new Set(prevMetrics.map((m) => m.id));
            const mergedMetrics = [...prevMetrics];
            for (const metric of connectedMetrics) {
              if (!haveMetrics.has(metric.id)) {
                mergedMetrics.push(metric);
                haveMetrics.add(metric.id);
              }
            }
            return mergedMetrics.length === prevMetrics.length
              ? prevMetrics
              : mergedMetrics;
          });
        }
        return mergedDims.length === prevDimensions.length
          ? prevDimensions
          : mergedDims;
      });
    },
    [],
  );

  const toggleTimeline = useCallback((timeline: Timeline) => {
    setTimelines((prev) => {
      const isSelected = prev.some((t) => t.id === timeline.id);
      return isSelected
        ? prev.filter((t) => t.id !== timeline.id)
        : [...prev, timeline];
    });
  }, []);

  const addTimelinesById = useCallback(
    (timelineIds: number[]) => {
      const timelinesById = new Map(allTimelines.map((t) => [t.id, t]));
      setTimelines((prev) => {
        const have = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        for (const id of timelineIds) {
          const timeline = timelinesById.get(id);
          if (timeline && !have.has(id)) {
            merged.push(timeline);
            have.add(id);
          }
        }
        return merged.length === prev.length ? prev : merged;
      });
    },
    [allTimelines],
  );

  return {
    metrics,
    dimensions,
    timelines,
    allTimelines,
    timelinesLoading,
    timelinesError,
    name,
    setName,
    setMetrics,
    setDimensions,
    setTimelines,
    addMetric,
    toggleMetric,
    toggleDimension,
    toggleTimeline,
    addTimelinesById,
  };
}
