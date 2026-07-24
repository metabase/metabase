import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  additionalSelectedDimensionIds?: Set<DimensionId>;
  // When true, select exactly `additionalSelectedDimensionIds` instead of unioning them onto the
  // interesting defaults. Used when the agent wants the metric sliced by only the dimensions it
  // names. Requires a non-empty `additionalSelectedDimensionIds`.
  replace?: boolean;
}

export interface ToggleDimensionContext {
  group: ExplorationDimensionGroup | null;
  metricsByDimension: Map<DimensionId, ExplorationMetric[]>;
  // When set, select only these metrics (e.g. the few the agent curated) instead of every related
  // metric. Restricted to the block's candidate metrics.
  selectedMetricIds?: Set<ExplorationMetric["id"]>;
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

  addTimelinesById: (timelineIds: number[]) => void;
  removeTimelinesById: (timelineIds: number[]) => void;

  removeBlock: (blockId: string) => void;

  removeBlockMembers: (
    blockId: string,
    members: {
      metricIds?: ExplorationMetric["id"][];
      dimensionIds?: DimensionId[];
    },
  ) => void;

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
  replace?: boolean,
): MetricBlock {
  const referencedDims = sortDimensionsByInterestingness(
    metric.dimension_ids
      .map((id) => dimensionsById.get(id))
      .filter((d): d is MetricDimension => d != null),
  );
  // The explicitly-requested dimensions (e.g. Metabot's picks) that the metric actually has.
  const requested = referencedDims.filter((d) =>
    additionalSelectedDimensionIds?.has(d.id),
  );
  let selectedDimensionIds: Set<DimensionId>;
  if (replace && requested.length > 0) {
    // Pin the block to exactly the requested dimensions (no interesting defaults).
    selectedDimensionIds = new Set(requested.map((d) => d.id));
  } else {
    const interesting = referencedDims.filter(isInterestingDimension);
    // Select the interesting dimensions; fall back to all so the block is
    // never created with an empty selection (BE rejects a metric with no dims).
    const base = interesting.length > 0 ? interesting : referencedDims;
    selectedDimensionIds = new Set(base.map((d) => d.id));
    // Add the explicitly-requested dimensions on top of the interesting defaults.
    for (const d of requested) {
      selectedDimensionIds.add(d.id);
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
  const requested = context.selectedMetricIds;
  // Default to every related metric; when a subset is requested, select just those (bounded by
  // the block's candidate metrics).
  const selectedMetricIds = requested
    ? new Set(metrics.filter((m) => requested.has(m.id)).map((m) => m.id))
    : new Set(metrics.map((m) => m.id));
  return {
    kind: "dimension",
    id: dimensionBlockId(dimension.id),
    dimension,
    groupDimensions,
    metrics,
    selectedMetricIds,
  };
}

export function useExplorationSelection(): ExplorationSelection {
  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const [blocks, setBlocks] = useState<ExplorationBlock[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string>(() => getDefaultExplorationName());
  const [collection, setCollection] = useState<ExplorationCollection>(() => ({
    id: personalCollectionId,
    name: t`Personal collection`,
  }));

  // The current-user selector may resolve after the first render, in which
  // case the useState initializer above captured `undefined`. Keep applying
  // the personal-collection default until the user picks a collection.
  const hasUserChosenCollection = useRef(false);
  const setCollectionExplicitly = useCallback(
    (collection: Required<ExplorationCollection>) => {
      hasUserChosenCollection.current = true;
      setCollection(collection);
    },
    [],
  );
  useEffect(() => {
    if (personalCollectionId != null && !hasUserChosenCollection.current) {
      setCollection((prev) =>
        prev.id === personalCollectionId
          ? prev
          : { id: personalCollectionId, name: t`Personal collection` },
      );
    }
  }, [personalCollectionId]);

  const {
    data: allTimelines = [],
    isLoading: timelinesLoading,
    error: timelinesError,
  } = useListTimelinesQuery({ include: "events" });

  const addMetric = useCallback(
    (
      metric: ExplorationMetric,
      {
        dimensionsById,
        additionalSelectedDimensionIds,
        replace,
      }: ToggleMetricContext,
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
            replace,
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
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== blockId);
      return next.length === prev.length ? prev : next;
    });
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
        let changed = false;
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
            if (selected.size === block.selectedDimensionIds.size) {
              // Nothing was actually deselected.
              next.push(block);
              continue;
            }
            changed = true;
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
            if (selected.size === block.selectedMetricIds.size) {
              // Nothing was actually deselected.
              next.push(block);
              continue;
            }
            changed = true;
            if (selected.size > 0) {
              next.push({ ...block, selectedMetricIds: selected });
            }
          }
        }
        return changed ? next : prev;
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
    setCollection: setCollectionExplicitly,
    addMetric,
    addDimension,
    addTimelinesById,
    removeTimelinesById,
    removeBlock,
    removeBlockMembers,
    toggleDimensionSelected,
    toggleMetricSelected,
  };
}
