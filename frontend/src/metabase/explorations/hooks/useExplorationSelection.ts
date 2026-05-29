import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
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

/**
 * The "Research plan" column is now a stack of collapsible blocks, each
 * organized around a single picked entity:
 *
 * - A **metric block** ("Look at metric in depth") puts a metric in the
 *   header and lists the dimensions the user wants to investigate it by
 *   in the body.
 *
 * - A **dimension block** ("Break by dimension") puts a dimension (or a
 *   dimension group, e.g., all `created_at` granularities) in the header
 *   and lists the metrics that reference it as a secondary set in the
 *   body.
 *
 * Blocks own their own dimension/metric sub-lists, so the same dimension
 * may legitimately appear in two metric blocks (and in a standalone
 * dimension block) without dedup — that matches the wireframe and the
 * stated rule that "even though some these dimensions might be already
 * listed in the first section" each block has its own copy.
 */
export interface MetricBlock {
  kind: "metric";
  /** Stable id used as React key + by `removeBlock`. Format: `metric:${metric.id}`. */
  id: string;
  metric: ExplorationMetric;
  /** Dimensions the user wants to break this metric by. */
  dimensions: MetricDimension[];
}

export interface DimensionBlock {
  kind: "dimension";
  /** Format: `dim:${head.id}`. */
  id: string;
  /**
   * The dimension that anchors this block. When the user toggled a group
   * row in the Browse picker (e.g., "Orders → Created At" covering
   * day/week/month/quarter), this is the group head; the full group
   * lives in `groupDimensions` so we can flatten it when POSTing.
   */
  dimension: MetricDimension;
  /** All dimensions covered by this picker row (group siblings + the head). */
  groupDimensions: MetricDimension[];
  /** Metrics that reference any of `groupDimensions`. Rendered as the block's body. */
  metrics: ExplorationMetric[];
}

export type ExplorationBlock = MetricBlock | DimensionBlock;

export function isMetricBlock(block: ExplorationBlock): block is MetricBlock {
  return block.kind === "metric";
}

export function isDimensionBlock(
  block: ExplorationBlock,
): block is DimensionBlock {
  return block.kind === "dimension";
}

/** Stable block id helpers — keep call sites symmetric with the union shape. */
export function metricBlockId(metricId: ExplorationMetric["id"]): string {
  return `metric:${metricId}`;
}

export function dimensionBlockId(dimensionId: DimensionId): string {
  return `dim:${dimensionId}`;
}

/**
 * Context the `toggleMetric` / `addMetric` helpers need to attach the
 * metric's "interesting" dimensions when adding it.
 */
export interface ToggleMetricContext {
  /** Flat map of every dimension across every group currently visible. */
  dimensionsById: Map<DimensionId, MetricDimension>;
}

/**
 * Context the `toggleDimension` helper needs to construct a dimension
 * block:
 *   - `group` carries the picker row's sibling dimensions (the
 *     Browse Dimensions panel groups e.g., every `created_at`
 *     granularity under one row),
 *   - `metricsByDimension` lets us hydrate the block's metric list.
 */
export interface ToggleDimensionContext {
  /** The group this dimension row represents. `null` if the row is a
   *  bare dimension (no group siblings). */
  group: ExplorationDimensionGroup | null;
  /** Map from dimension id → metrics that reference that dimension. */
  metricsByDimension: Map<DimensionId, ExplorationMetric[]>;
}

export interface ExplorationSelection {
  /** Source of truth: ordered list of blocks rendered in the Research plan. */
  blocks: ExplorationBlock[];

  /** Set of metric ids that have their own primary block. Used by the
   *  Browse Metrics picker to show the "selected" check. */
  metricBlockIds: Set<ExplorationMetric["id"]>;
  /** Set of dimension ids that have their own primary block (or are the
   *  head dimension of a group-keyed block). Used by Browse Dimensions. */
  dimensionBlockIds: Set<DimensionId>;

  /**
   * Flat, deduped union of every metric appearing in any block (primary
   * or secondary). Used to build the POST body for `/api/exploration`.
   */
  metrics: ExplorationMetric[];
  /**
   * Flat, deduped union of every dimension across blocks (including
   * group siblings inside dimension blocks). Used to build the POST body.
   */
  dimensions: MetricDimension[];

  /** Timelines selected globally — applied to the whole exploration. */
  timelines: Timeline[];
  /** All timelines from the API (includes events). */
  allTimelines: Timeline[];
  timelinesLoading: boolean;
  timelinesError: unknown;

  name: string;
  setName: Dispatch<SetStateAction<string>>;

  /** Direct setter — used by tests to seed state. Prefer `addMetric` /
   *  `toggleMetric` / `toggleDimension` in production code. */
  setBlocks: Dispatch<SetStateAction<ExplorationBlock[]>>;
  setTimelines: Dispatch<SetStateAction<Timeline[]>>;

  /**
   * Idempotently ensure a metric block exists. Used by the chat tool
   * to add metrics surfaced by the LLM without toggling them off if
   * they were already present.
   */
  addMetric: (metric: ExplorationMetric, context: ToggleMetricContext) => void;

  /**
   * Toggle a metric **block**. Creates the block (with the metric's
   * interesting dimensions pre-populated) if absent; removes it if
   * present. Idempotent per click. Does **not** affect secondary
   * appearances of this metric inside dimension blocks.
   */
  toggleMetric: (
    metric: ExplorationMetric,
    context: ToggleMetricContext,
  ) => void;

  /**
   * Toggle a dimension **block**. Creates the block (with every metric
   * referencing the group's dimensions hydrated as secondaries) if
   * absent; removes it if present.
   */
  toggleDimension: (
    dimension: MetricDimension,
    context: ToggleDimensionContext,
  ) => void;

  toggleTimeline: (timeline: Timeline) => void;
  /** Resolve ids against `allTimelines` and merge into the selection. Idempotent. */
  addTimelinesById: (timelineIds: number[]) => void;

  /** Remove a block by id (metric or dimension). */
  removeBlock: (blockId: string) => void;
  /**
   * Remove a dimension from a metric block's body. No-op if the block
   * is not a metric block or the dimension isn't in it.
   */
  removeDimensionFromMetricBlock: (
    blockId: string,
    dimensionId: DimensionId,
  ) => void;
  /**
   * Remove a metric from a dimension block's body. No-op if the block
   * is not a dimension block or the metric isn't in it.
   */
  removeMetricFromDimensionBlock: (
    blockId: string,
    metricId: ExplorationMetric["id"],
  ) => void;

  /**
   * Append a dimension to a metric block's body. Used by DnD drops
   * from the Browse Dimensions list onto a metric block. Idempotent
   * (no-op if the block already includes this dimension). Returns
   * silently if the target isn't a metric block.
   */
  addDimensionToMetricBlock: (
    blockId: string,
    dimension: MetricDimension,
  ) => void;
  /**
   * Append a metric to a dimension block's body. Used by DnD drops
   * from the Browse Metrics list onto a dimension block. Idempotent
   * (no-op if the block already includes this metric). Returns
   * silently if the target isn't a dimension block.
   */
  addMetricToDimensionBlock: (
    blockId: string,
    metric: ExplorationMetric,
  ) => void;
}

/**
 * Order a metric block's dimensions by `dimension_interestingness`
 * (descending; null treated as 0). Returns a new array — never mutates
 * the input. Ties keep their incoming order (stable). Both the rendered
 * pills and the `CreateExplorationRequest` group read from
 * `block.dimensions`, so sorting here keeps display and request
 * consistent and matches the interestingness-desc order used by the
 * Data palette's dimension list.
 */
function sortDimensionsByInterestingness(
  dimensions: MetricDimension[],
): MetricDimension[] {
  return [...dimensions].sort(
    (a, b) =>
      (b.dimension_interestingness ?? 0) - (a.dimension_interestingness ?? 0),
  );
}

function buildMetricBlock(
  metric: ExplorationMetric,
  dimensionsById: Map<DimensionId, MetricDimension>,
): MetricBlock {
  const referencedDims = metric.dimension_ids
    .map((id) => dimensionsById.get(id))
    .filter((d): d is MetricDimension => d != null);
  const hasInteresting = referencedDims.some(isInterestingDimension);
  const dimensions = hasInteresting
    ? referencedDims.filter(isInterestingDimension)
    : referencedDims;
  return {
    kind: "metric",
    id: metricBlockId(metric.id),
    metric,
    dimensions: sortDimensionsByInterestingness(dimensions),
  };
}

function buildDimensionBlock(
  dimension: MetricDimension,
  context: ToggleDimensionContext,
): DimensionBlock {
  const groupDimensions = context.group?.dimensions ?? [dimension];
  const seenMetricIds = new Set<ExplorationMetric["id"]>();
  const metrics: ExplorationMetric[] = [];
  for (const groupDim of groupDimensions) {
    for (const metric of context.metricsByDimension.get(groupDim.id) ?? []) {
      if (!seenMetricIds.has(metric.id)) {
        seenMetricIds.add(metric.id);
        metrics.push(metric);
      }
    }
  }
  return {
    kind: "dimension",
    id: dimensionBlockId(dimension.id),
    dimension,
    groupDimensions,
    metrics,
  };
}

/**
 * Owns the lifted state for `/question/research`'s new-exploration page:
 * an ordered list of "Research plan" blocks (metric- or dimension-keyed),
 * plus the global timeline selection and exploration name. Toggle
 * helpers create/remove primary blocks; the Browse pickers, chat tool
 * calls, and Research plan pill removals all funnel through the same
 * block operations so the UI stays in sync.
 */
export function useExplorationSelection(): ExplorationSelection {
  const [blocks, setBlocks] = useState<ExplorationBlock[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string>(getDefaultExplorationName());

  const {
    data: allTimelines = [],
    isLoading: timelinesLoading,
    error: timelinesError,
  } = useListTimelinesQuery({ include: "events" });

  const addMetric = useCallback(
    (metric: ExplorationMetric, { dimensionsById }: ToggleMetricContext) => {
      setBlocks((prevBlocks) => {
        if (
          prevBlocks.some((b) => isMetricBlock(b) && b.metric.id === metric.id)
        ) {
          return prevBlocks;
        }
        return [...prevBlocks, buildMetricBlock(metric, dimensionsById)];
      });
    },
    [],
  );

  const toggleMetric = useCallback(
    (metric: ExplorationMetric, { dimensionsById }: ToggleMetricContext) => {
      const id = metricBlockId(metric.id);
      setBlocks((prevBlocks) => {
        if (prevBlocks.some((b) => b.id === id)) {
          return prevBlocks.filter((b) => b.id !== id);
        }
        return [...prevBlocks, buildMetricBlock(metric, dimensionsById)];
      });
    },
    [],
  );

  const toggleDimension = useCallback(
    (dimension: MetricDimension, context: ToggleDimensionContext) => {
      const id = dimensionBlockId(dimension.id);
      setBlocks((prevBlocks) => {
        if (prevBlocks.some((b) => b.id === id)) {
          return prevBlocks.filter((b) => b.id !== id);
        }
        return [...prevBlocks, buildDimensionBlock(dimension, context)];
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

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const removeDimensionFromMetricBlock = useCallback(
    (blockId: string, dimensionId: DimensionId) => {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id !== blockId || !isMetricBlock(block)) {
            return block;
          }
          const nextDims = block.dimensions.filter((d) => d.id !== dimensionId);
          return nextDims.length === block.dimensions.length
            ? block
            : { ...block, dimensions: nextDims };
        }),
      );
    },
    [],
  );

  const removeMetricFromDimensionBlock = useCallback(
    (blockId: string, metricId: ExplorationMetric["id"]) => {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id !== blockId || !isDimensionBlock(block)) {
            return block;
          }
          const nextMetrics = block.metrics.filter((m) => m.id !== metricId);
          return nextMetrics.length === block.metrics.length
            ? block
            : { ...block, metrics: nextMetrics };
        }),
      );
    },
    [],
  );

  const addDimensionToMetricBlock = useCallback(
    (blockId: string, dimension: MetricDimension) => {
      setBlocks((prev) => {
        let changed = false;
        const next = prev.map((block) => {
          if (block.id !== blockId || !isMetricBlock(block)) {
            return block;
          }
          if (block.dimensions.some((d) => d.id === dimension.id)) {
            return block;
          }
          changed = true;
          return {
            ...block,
            dimensions: sortDimensionsByInterestingness([
              ...block.dimensions,
              dimension,
            ]),
          };
        });
        return changed ? next : prev;
      });
    },
    [],
  );

  const addMetricToDimensionBlock = useCallback(
    (blockId: string, metric: ExplorationMetric) => {
      setBlocks((prev) => {
        let changed = false;
        const next = prev.map((block) => {
          if (block.id !== blockId || !isDimensionBlock(block)) {
            return block;
          }
          if (block.metrics.some((m) => m.id === metric.id)) {
            return block;
          }
          changed = true;
          return { ...block, metrics: [...block.metrics, metric] };
        });
        return changed ? next : prev;
      });
    },
    [],
  );

  // Derived aggregations: flat metrics / dimensions across blocks.
  const metricBlockIds = useMemo(() => {
    const ids = new Set<ExplorationMetric["id"]>();
    for (const block of blocks) {
      if (isMetricBlock(block)) {
        ids.add(block.metric.id);
      }
    }
    return ids;
  }, [blocks]);

  const dimensionBlockIds = useMemo(() => {
    const ids = new Set<DimensionId>();
    for (const block of blocks) {
      if (isDimensionBlock(block)) {
        // Treat every dimension covered by the group row as "selected"
        // in the Browse picker — otherwise the picker would show the
        // group row unchecked even though a dim block exists for it.
        for (const d of block.groupDimensions) {
          ids.add(d.id);
        }
      }
    }
    return ids;
  }, [blocks]);

  const metrics = useMemo(() => {
    const seen = new Set<ExplorationMetric["id"]>();
    const out: ExplorationMetric[] = [];
    for (const block of blocks) {
      if (isMetricBlock(block)) {
        if (!seen.has(block.metric.id)) {
          seen.add(block.metric.id);
          out.push(block.metric);
        }
      } else {
        for (const metric of block.metrics) {
          if (!seen.has(metric.id)) {
            seen.add(metric.id);
            out.push(metric);
          }
        }
      }
    }
    return out;
  }, [blocks]);

  const dimensions = useMemo(() => {
    const seen = new Set<DimensionId>();
    const out: MetricDimension[] = [];
    for (const block of blocks) {
      const fromBlock = isMetricBlock(block)
        ? block.dimensions
        : block.groupDimensions;
      for (const d of fromBlock) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          out.push(d);
        }
      }
    }
    return out;
  }, [blocks]);

  return {
    blocks,
    metricBlockIds,
    dimensionBlockIds,
    metrics,
    dimensions,
    timelines,
    allTimelines,
    timelinesLoading,
    timelinesError,
    name,
    setName,
    setBlocks,
    setTimelines,
    addMetric,
    toggleMetric,
    toggleDimension,
    toggleTimeline,
    addTimelinesById,
    removeBlock,
    removeDimensionFromMetricBlock,
    removeMetricFromDimensionBlock,
    addDimensionToMetricBlock,
    addMetricToDimensionBlock,
  };
}
