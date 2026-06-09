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

  removeBlock: (blockId: string) => void;

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
): MetricBlock {
  const referencedDims = sortDimensionsByInterestingness(
    metric.dimension_ids
      .map((id) => dimensionsById.get(id))
      .filter((d): d is MetricDimension => d != null),
  );
  const interesting = referencedDims.filter(isInterestingDimension);

  const selected = interesting.length > 0 ? interesting : referencedDims;
  return {
    kind: "metric",
    id: metricBlockId(metric.id),
    metric,
    dimensions: referencedDims,
    selectedDimensionIds: new Set(selected.map((d) => d.id)),
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

  const addDimension = useCallback(
    (dimension: MetricDimension, context: ToggleDimensionContext) => {
      const id = dimensionBlockId(dimension.id);
      setBlocks((prevBlocks) => {
        if (prevBlocks.some((b) => b.id === id)) {
          return prevBlocks;
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
    removeBlock,
    toggleDimensionSelected,
    toggleMetricSelected,
  };
}
