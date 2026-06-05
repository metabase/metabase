import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import {
  getDefaultExplorationName,
  isInterestingDimension,
} from "metabase/explorations/constants";
import type { ExplorationCollection } from "metabase/explorations/types";
import { useSelector } from "metabase/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type {
  DimensionId,
  ExplorationDimensionGroup,
  ExplorationMetric,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

export interface MetricBlock {
  kind: "metric";
  id: string;
  metric: ExplorationMetric;
  dimensions: MetricDimension[]; // sorted by interestingness
  selectedDimensionIds: Set<DimensionId>;
}

export interface DimensionBlock {
  kind: "dimension";
  id: string;
  dimension: MetricDimension;
  groupDimensions: MetricDimension[];
  metrics: ExplorationMetric[];
  selectedMetricIds: Set<ExplorationMetric["id"]>;
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
  // Dimensions to select in addition to the interesting defaults (e.g. dimensions Metabot
  // explicitly chose to fit the user's question). Restricted to the metric's own dimensions.
  additionalSelectedDimensionIds?: Set<DimensionId>;
}

export interface ToggleDimensionContext {
  group: ExplorationDimensionGroup | null;
  metricsByDimension: Map<DimensionId, ExplorationMetric[]>;
}

export interface ExplorationSelection {
  blocks: ExplorationBlock[];
  metricBlockIds: Set<ExplorationMetric["id"]>;
  dimensionBlockIds: Set<DimensionId>;

  timelines: Timeline[];

  allTimelines: Timeline[];
  timelinesLoading: boolean;
  timelinesError: unknown;

  name: string;
  collection: ExplorationCollection;

  setBlocks: Dispatch<SetStateAction<ExplorationBlock[]>>;
  setTimelines: Dispatch<SetStateAction<Timeline[]>>;
  setName: Dispatch<SetStateAction<string>>;
  setCollection: (collection: Required<ExplorationCollection>) => void;

  addMetric: (metric: ExplorationMetric, context: ToggleMetricContext) => void;
  addDimension: (
    dimension: MetricDimension,
    context: ToggleDimensionContext,
  ) => void;

  toggleTimeline: (timeline: Timeline) => void;
  addTimelinesById: (timelineIds: number[]) => void;
  removeTimelinesById: (timelineIds: number[]) => void;

  removeBlock: (blockId: string) => void;

  // Deselect metrics and/or dimensions within a block. Metric ids apply to a dimension block,
  // dimension ids to a metric block; a mismatched family is ignored. If the removal empties the
  // block's selection, the whole block is dropped.
  removeBlockMembers: (
    blockId: string,
    members: {
      metricIds?: ExplorationMetric["id"][];
      dimensionIds?: DimensionId[];
    },
  ) => void;

  // Flip whether a candidate child is selected within an existing block.
  toggleDimensionSelected: (blockId: string, dimensionId: DimensionId) => void;
  toggleMetricSelected: (
    blockId: string,
    metricId: ExplorationMetric["id"],
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
  additionalSelectedDimensionIds?: Set<DimensionId>,
): MetricBlock {
  const referencedDims = sortDimensionsByInterestingness(
    metric.dimension_ids
      .map((id) => dimensionsById.get(id))
      .filter((d): d is MetricDimension => d != null),
  );
  const interesting = referencedDims.filter(isInterestingDimension);
  // Select the interesting dimensions; fall back to all so the block is
  // never created with an empty selection (BE rejects a metric with no dims).
  const base = interesting.length > 0 ? interesting : referencedDims;
  const selectedDimensionIds = new Set(base.map((d) => d.id));
  // Add any explicitly-requested dimensions (e.g. Metabot's picks) that the metric actually has.
  if (additionalSelectedDimensionIds) {
    for (const d of referencedDims) {
      if (additionalSelectedDimensionIds.has(d.id)) {
        selectedDimensionIds.add(d.id);
      }
    }
  }
  return {
    kind: "metric",
    id: metricBlockId(metric.id),
    metric,
    dimensions: referencedDims,
    selectedDimensionIds,
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
    selectedMetricIds: new Set(metrics.map((m) => m.id)),
  };
}

export function useExplorationSelection(): ExplorationSelection {
  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const [blocks, setBlocks] = useState<ExplorationBlock[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string>(getDefaultExplorationName());
  const [collection, setCollection] = useState<ExplorationCollection>({
    id: personalCollectionId,
    name: t`Personal collection`,
  });

  const {
    data: allTimelines = [],
    isLoading: timelinesLoading,
    error: timelinesError,
  } = useListTimelinesQuery({ include: "events" });

  const addMetric = useCallback(
    (
      metric: ExplorationMetric,
      { dimensionsById, additionalSelectedDimensionIds }: ToggleMetricContext,
    ) => {
      setBlocks((prevBlocks) => {
        const existing = prevBlocks.find(
          (b): b is MetricBlock =>
            isMetricBlock(b) && b.metric.id === metric.id,
        );
        if (existing) {
          // Create-or-grow: the block already exists, so union the explicitly-requested
          // dimensions into its selection (never deselects). With no explicit dimensions there is
          // nothing to add, so this is a no-op.
          if (!additionalSelectedDimensionIds?.size) {
            return prevBlocks;
          }
          const candidateIds = new Set(existing.dimensions.map((d) => d.id));
          const selected = new Set(existing.selectedDimensionIds);
          for (const id of additionalSelectedDimensionIds) {
            if (candidateIds.has(id)) {
              selected.add(id);
            }
          }
          if (selected.size === existing.selectedDimensionIds.size) {
            return prevBlocks;
          }
          return prevBlocks.map((b) =>
            b === existing
              ? { ...existing, selectedDimensionIds: selected }
              : b,
          );
        }
        return [
          ...prevBlocks,
          buildMetricBlock(
            metric,
            dimensionsById,
            additionalSelectedDimensionIds,
          ),
        ];
      });
    },
    [],
  );

  const addDimension = useCallback(
    (dimension: MetricDimension, context: ToggleDimensionContext) => {
      const id = dimensionBlockId(dimension.id);
      setBlocks((prevBlocks) => {
        const existing = prevBlocks.find(
          (b): b is DimensionBlock => b.id === id && isDimensionBlock(b),
        );
        if (existing) {
          // Create-or-grow: the block already exists, so re-select every related metric (union;
          // never deselects), bounded by the block's candidate metrics.
          const rebuilt = buildDimensionBlock(dimension, context);
          const candidateIds = new Set(existing.metrics.map((m) => m.id));
          const selected = new Set(existing.selectedMetricIds);
          for (const metricId of rebuilt.selectedMetricIds) {
            if (candidateIds.has(metricId)) {
              selected.add(metricId);
            }
          }
          if (selected.size === existing.selectedMetricIds.size) {
            return prevBlocks;
          }
          return prevBlocks.map((b) =>
            b === existing ? { ...existing, selectedMetricIds: selected } : b,
          );
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

  const removeTimelinesById = useCallback((timelineIds: number[]) => {
    const remove = new Set(timelineIds);
    setTimelines((prev) => {
      const next = prev.filter((t) => !remove.has(t.id));
      // Preserve the reference when no selected timeline matched (no-op for unknown ids).
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const removeBlockMembers = useCallback(
    (
      blockId: string,
      {
        metricIds,
        dimensionIds,
      }: {
        metricIds?: ExplorationMetric["id"][];
        dimensionIds?: DimensionId[];
      },
    ) => {
      setBlocks((prev) => {
        const next: ExplorationBlock[] = [];
        for (const block of prev) {
          if (block.id !== blockId) {
            next.push(block);
            continue;
          }
          if (isMetricBlock(block)) {
            // Dimension ids deselect candidate dimensions; metric ids don't apply here.
            if (!dimensionIds?.length) {
              next.push(block);
              continue;
            }
            const selected = new Set(block.selectedDimensionIds);
            for (const id of dimensionIds) {
              selected.delete(id);
            }
            // A metric block with no selected dimensions is invalid — drop it entirely.
            if (selected.size > 0) {
              next.push({ ...block, selectedDimensionIds: selected });
            }
          } else {
            // Metric ids deselect candidate metrics; dimension ids don't apply here.
            if (!metricIds?.length) {
              next.push(block);
              continue;
            }
            const selected = new Set(block.selectedMetricIds);
            for (const id of metricIds) {
              selected.delete(id);
            }
            if (selected.size > 0) {
              next.push({ ...block, selectedMetricIds: selected });
            }
          }
        }
        return next;
      });
    },
    [],
  );

  const toggleDimensionSelected = useCallback(
    (blockId: string, dimensionId: DimensionId) => {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id !== blockId || !isMetricBlock(block)) {
            return block;
          }
          const next = new Set(block.selectedDimensionIds);
          if (next.has(dimensionId)) {
            next.delete(dimensionId);
          } else {
            next.add(dimensionId);
          }
          return { ...block, selectedDimensionIds: next };
        }),
      );
    },
    [],
  );

  const toggleMetricSelected = useCallback(
    (blockId: string, metricId: ExplorationMetric["id"]) => {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id !== blockId || !isDimensionBlock(block)) {
            return block;
          }
          const next = new Set(block.selectedMetricIds);
          if (next.has(metricId)) {
            next.delete(metricId);
          } else {
            next.add(metricId);
          }
          return { ...block, selectedMetricIds: next };
        }),
      );
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

  return {
    blocks,
    metricBlockIds,
    dimensionBlockIds,
    timelines,
    allTimelines,
    timelinesLoading,
    timelinesError,
    name,
    collection,
    setBlocks,
    setTimelines,
    setName,
    setCollection,
    addMetric,
    addDimension,
    toggleTimeline,
    addTimelinesById,
    removeTimelinesById,
    removeBlock,
    removeBlockMembers,
    toggleDimensionSelected,
    toggleMetricSelected,
  };
}
