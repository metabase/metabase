import type {
  Exploration,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationQueryStatus,
} from "metabase-types/api";

export const METRIC_HEADING_ID = "metric:1";

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
    ...overrides,
  };
}

export interface CreateExplorationOpts {
  queries?: ExplorationQuery[];
  groups?: ExplorationQueryGroup[];
  documents?: ExplorationDocument[];
  /** Thread chat prompt — set when the exploration was created with LLM context. */
  prompt?: string | null;
}

export function createExploration({
  queries = [],
  groups,
  documents = [],
  prompt = null,
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
      {
        id: 1,
        exploration_id: 1,
        name: null,
        prompt,
        position: 0,
        started_at: "2026-04-30T00:00:00Z",
        completed_at: null,
        entity_id: "thrd00000000000000001",
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
        queries,
        groups: finalGroups,
        documents,
      },
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
): ExplorationQueryGroup {
  return {
    id,
    parent_group_id: null,
    position,
    type: "auto",
    display_type: "sidebar",
    name,
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
