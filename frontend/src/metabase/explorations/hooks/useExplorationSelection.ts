import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { useListTimelinesQuery } from "metabase/api";
import { getUserPersonalCollectionId } from "metabase/current-user";
import {
  getDefaultExplorationName,
  isInterestingDimension,
} from "metabase/explorations/constants";
import type { ExplorationCollection } from "metabase/explorations/types";
import { useSelector } from "metabase/redux";
import type {
  DimensionId,
  ExplorationMetric,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

export interface ExplorationBlock {
  id: string;
  metric: ExplorationMetric;
  dimensions: MetricDimension[]; // sorted by interestingness
  selectedDimensionIds: Set<DimensionId>;
}

export function metricBlockId(metricId: ExplorationMetric["id"]): string {
  return `metric:${metricId}`;
}

export interface ToggleMetricContext {
  dimensionsById: Map<DimensionId, MetricDimension>;
  additionalSelectedDimensionIds?: Set<DimensionId>;
  // When true, select exactly `additionalSelectedDimensionIds` instead of unioning them onto the
  // interesting defaults. Used when the agent wants the metric sliced by only the dimensions it
  // names. Requires a non-empty `additionalSelectedDimensionIds`.
  replace?: boolean;
}

export interface ExplorationSelection {
  blocks: ExplorationBlock[];
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
  addTimelinesById: (timelineIds: number[]) => void;
  removeTimelinesById: (timelineIds: number[]) => void;
  removeBlock: (blockId: string) => void;
  removeBlockDimensions: (blockId: string, dimensionIds: DimensionId[]) => void;
  toggleDimensionSelected: (blockId: string, dimensionId: DimensionId) => void;
}

function sortDimensionsByInterestingness(
  dimensions: MetricDimension[],
): MetricDimension[] {
  return [...dimensions].sort(
    (a, b) =>
      (b.dimension_interestingness ?? 0) - (a.dimension_interestingness ?? 0),
  );
}

function buildExplorationBlock(
  metric: ExplorationMetric,
  dimensionsById: Map<DimensionId, MetricDimension>,
  additionalSelectedDimensionIds?: Set<DimensionId>,
  replace?: boolean,
): ExplorationBlock {
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
    id: metricBlockId(metric.id),
    metric,
    dimensions: referencedDims,
    selectedDimensionIds,
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
        const existing = prevBlocks.find((b) => b.metric.id === metric.id);
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
          buildExplorationBlock(
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

  const removeBlockDimensions = useCallback(
    (blockId: string, dimensionIds: DimensionId[]) => {
      setBlocks((prev) => {
        let changed = false;
        const next: ExplorationBlock[] = [];
        for (const block of prev) {
          if (block.id !== blockId) {
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
          if (block.id !== blockId) {
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

  return {
    blocks,
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
    addTimelinesById,
    removeTimelinesById,
    removeBlock,
    removeBlockDimensions,
    toggleDimensionSelected,
  };
}
