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

export interface MetricBlock {
  kind: "metric";
  id: string;
  metric: ExplorationMetric;
  dimensions: MetricDimension[];
}

export interface DimensionBlock {
  kind: "dimension";
  id: string;
  dimension: MetricDimension;
  groupDimensions: MetricDimension[];
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

export function metricBlockId(metricId: ExplorationMetric["id"]): string {
  return `metric:${metricId}`;
}

export function dimensionBlockId(dimensionId: DimensionId): string {
  return `dim:${dimensionId}`;
}

export interface ToggleMetricContext {
  dimensionsById: Map<DimensionId, MetricDimension>;
}

export interface ToggleDimensionContext {
  group: ExplorationDimensionGroup | null;
  metricsByDimension: Map<DimensionId, ExplorationMetric[]>;
}

export interface ExplorationSelection {
  blocks: ExplorationBlock[];
  metricBlockIds: Set<ExplorationMetric["id"]>;
  dimensionBlockIds: Set<DimensionId>;

  metrics: ExplorationMetric[];
  dimensions: MetricDimension[];
  timelines: Timeline[];

  allTimelines: Timeline[];
  timelinesLoading: boolean;
  timelinesError: unknown;

  name: string;
  setName: Dispatch<SetStateAction<string>>;

  setBlocks: Dispatch<SetStateAction<ExplorationBlock[]>>;
  setTimelines: Dispatch<SetStateAction<Timeline[]>>;

  addMetric: (metric: ExplorationMetric, context: ToggleMetricContext) => void;

  toggleMetric: (
    metric: ExplorationMetric,
    context: ToggleMetricContext,
  ) => void;

  toggleDimension: (
    dimension: MetricDimension,
    context: ToggleDimensionContext,
  ) => void;

  toggleTimeline: (timeline: Timeline) => void;
  addTimelinesById: (timelineIds: number[]) => void;

  removeBlock: (blockId: string) => void;
  removeDimensionFromMetricBlock: (
    blockId: string,
    dimensionId: DimensionId,
  ) => void;
  removeMetricFromDimensionBlock: (
    blockId: string,
    metricId: ExplorationMetric["id"],
  ) => void;

  addDimensionToMetricBlock: (
    blockId: string,
    dimension: MetricDimension,
  ) => void;

  addMetricToDimensionBlock: (
    blockId: string,
    metric: ExplorationMetric,
  ) => void;
}

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
