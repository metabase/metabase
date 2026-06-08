import type {
  Exploration,
  ExplorationDocument,
  ExplorationMetric,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationQueryStatus,
  ExplorationSummary,
  ExplorationThread,
  MetricDimension,
  Timeline,
} from "metabase-types/api";

import type {
  DimensionBlock,
  ExplorationBlock,
  ExplorationSelection,
  MetricBlock,
} from "./hooks";
import {
  dimensionBlockId,
  metricBlockId,
} from "./hooks/useExplorationSelection";

export const METRIC_HEADING_ID = "metric:1";

export interface MockSelectionOpts {
  blocks?: ExplorationBlock[];
  timelines?: Timeline[];
  allTimelines?: Timeline[];
}

export function mockMetricBlock(
  metric: ExplorationMetric,
  dimensions: MetricDimension[] = [],
  selectedDimensionIds?: Set<MetricDimension["id"]>,
): MetricBlock {
  return {
    kind: "metric",
    id: metricBlockId(metric.id),
    metric,
    dimensions,
    selectedDimensionIds:
      selectedDimensionIds ?? new Set(dimensions.map((d) => d.id)),
  };
}

export function mockDimensionBlock(
  dimension: MetricDimension,
  metrics: ExplorationMetric[] = [],
  groupDimensions?: MetricDimension[],
  selectedMetricIds?: Set<ExplorationMetric["id"]>,
): DimensionBlock {
  return {
    kind: "dimension",
    id: dimensionBlockId(dimension.id),
    dimension,
    groupDimensions: groupDimensions ?? [dimension],
    metrics,
    selectedMetricIds: selectedMetricIds ?? new Set(metrics.map((m) => m.id)),
  };
}

export function makeMockSelection(
  opts: MockSelectionOpts = {},
): ExplorationSelection {
  const blocks = opts.blocks ?? [];
  const timelines = opts.timelines ?? [];
  const allTimelines = opts.allTimelines ?? [];

  const metricBlockIds = new Set<ExplorationMetric["id"]>();
  const dimensionBlockIds = new Set<MetricDimension["id"]>();
  const metricSeen = new Set<ExplorationMetric["id"]>();
  const metrics: ExplorationMetric[] = [];
  const dimensionSeen = new Set<MetricDimension["id"]>();
  const dimensions: MetricDimension[] = [];

  for (const block of blocks) {
    if (block.kind === "metric") {
      metricBlockIds.add(block.metric.id);
      if (!metricSeen.has(block.metric.id)) {
        metricSeen.add(block.metric.id);
        metrics.push(block.metric);
      }
      for (const d of block.dimensions) {
        if (block.selectedDimensionIds.has(d.id) && !dimensionSeen.has(d.id)) {
          dimensionSeen.add(d.id);
          dimensions.push(d);
        }
      }
    } else {
      for (const d of block.groupDimensions) {
        dimensionBlockIds.add(d.id);
        if (!dimensionSeen.has(d.id)) {
          dimensionSeen.add(d.id);
          dimensions.push(d);
        }
      }
      for (const m of block.metrics) {
        if (block.selectedMetricIds.has(m.id) && !metricSeen.has(m.id)) {
          metricSeen.add(m.id);
          metrics.push(m);
        }
      }
    }
  }

  return {
    blocks,
    metricBlockIds,
    dimensionBlockIds,
    timelines,
    allTimelines,
    timelinesLoading: false,
    timelinesError: null,
    name: "",
    collection: { name: "Personal collection" },
    setName: jest.fn(),
    setCollection: jest.fn(),
    setBlocks: jest.fn(),
    setTimelines: jest.fn(),
    addMetric: jest.fn(),
    addDimension: jest.fn(),
    toggleTimeline: jest.fn(),
    addTimelinesById: jest.fn(),
    removeBlock: jest.fn(),
    toggleDimensionSelected: jest.fn(),
    toggleMetricSelected: jest.fn(),
  };
}

export function createQuery(
  overrides: Partial<ExplorationQuery> & {
    id: number;
    name: string;
    status: ExplorationQueryStatus;
  },
): ExplorationQuery {
  return {
    exploration_thread_id: 1,
    card_id: overrides.card_id ?? 1,
    dimension_id: overrides.dimension_id ?? `dim-${overrides.id}`,
    dimension_name: overrides.name,
    query_type: "default",
    display: null,
    position: 0,
    error_message: null,
    started_at: null,
    finished_at: null,
    entity_id: "abc123def456ghij78901",
    interestingness_score: null,
    dataset_query: { type: "query", database: 1, query: {} } as any,
    segment_id: null,
    segment_name: null,
    ...overrides,
  };
}

export function createGroup(
  overrides: Partial<ExplorationQueryGroup> &
    Pick<ExplorationQueryGroup, "id" | "name">,
): ExplorationQueryGroup {
  return {
    parent_group_id: null,
    position: 0,
    type: "auto",
    display_type: "page",
    query_ids: [],
    ...overrides,
  };
}

export function createThread(
  overrides: Partial<ExplorationThread> = {},
): ExplorationThread {
  return {
    id: 1,
    exploration_id: 1,
    name: null,
    prompt: null,
    position: 0,
    started_at: "2026-04-30T00:00:00Z",
    completed_at: null,
    entity_id: "thrd00000000000000001",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    canceled_at: null,
    ...overrides,
  };
}

export interface CreateExplorationOpts {
  queries?: ExplorationQuery[];
  groups?: ExplorationQueryGroup[];
  documents?: ExplorationDocument[];
  /** Thread chat prompt — set when the exploration was created with LLM context. */
  prompt?: string | null;
  thread?: Partial<ExplorationThread>;
}

export function createExploration({
  queries = [],
  groups,
  documents = [],
  prompt = null,
  thread: threadOverrides = {},
}: CreateExplorationOpts = {}): Exploration {
  const finalGroups: ExplorationQueryGroup[] = groups ?? [
    {
      id: METRIC_HEADING_ID,
      parent_group_id: null,
      position: 0,
      type: "auto",
      display_type: "sidebar",
      name: "Initial investigation",
      query_ids: [],
    },
    ...queries.map((q, i) => ({
      id: `auto:1:dim-${q.id}`,
      parent_group_id: METRIC_HEADING_ID,
      position: i,
      type: "auto" as const,
      display_type: "singleton" as const,
      name: q.name,
      query_ids: [q.id],
    })),
  ];

  return {
    id: 1,
    name: "My exploration",
    description: null,
    creator_id: 1,
    can_write: true,
    archived: false,
    collection_id: null,
    collection_position: null,
    collection: null,
    entity_id: "expl00000000000000001",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    threads: [
      createThread({
        queries,
        groups: finalGroups,
        documents,
        prompt,
        ...threadOverrides,
      }),
    ],
  };
}

export function createExplorationDocument(
  overrides: Partial<ExplorationDocument> &
    Pick<ExplorationDocument, "id" | "name">,
): ExplorationDocument {
  return {
    exploration_thread_id: 1,
    creator_id: 1,
    content_type: "text/html",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    ...overrides,
  };
}

export function metricGroup(
  id: string,
  name: string,
  position: number,
  groupName?: string,
): ExplorationQueryGroup {
  return {
    id,
    parent_group_id: null,
    position,
    type: "auto",
    display_type: "sidebar",
    name,
    group_name: groupName ?? name,
    query_ids: [],
  };
}

export function leafGroup(
  id: string,
  parentId: string,
  queryIds: number[],
  position: number,
  name = "Leaf",
  displayType: ExplorationQueryGroup["display_type"] = "singleton",
): ExplorationQueryGroup {
  return {
    id,
    parent_group_id: parentId,
    position,
    type: "auto",
    display_type: displayType,
    name,
    query_ids: queryIds,
  };
}

export function createExplorationSummary(
  opts?: Partial<ExplorationSummary>,
): ExplorationSummary {
  return {
    id: 1,
    name: "Revenue investigation",
    creator_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    current_user_last_touched_at: "2026-01-02T00:00:00Z",
    ...opts,
  };
}
