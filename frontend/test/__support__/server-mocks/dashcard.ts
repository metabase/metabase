import fetchMock from "fetch-mock";

import type { StoreDashcard } from "metabase/redux/store";
import type {
  CardId,
  DashCardId,
  DashboardId,
  Dataset,
} from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";

export function setupDashcardQueryEndpoints(
  dashboardId: DashboardId,
  dashcard: StoreDashcard,
  dataset: Dataset,
) {
  fetchMock.post(
    `path:/api/dashboard/${dashboardId}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
    dataset,
  );
}

type BatchDashcardRef = { id: DashCardId; card_id: CardId };

type BatchErrorContext = {
  error: string;
  error_type?: string;
  error_is_curated?: boolean;
  json_query?: Record<string, unknown>;
};

export function buildCardQueryBatchNdjson(
  dashcards: BatchDashcardRef[],
  dataset: Dataset = createMockDataset(),
  errors: Map<DashCardId, BatchErrorContext> = new Map(),
): string {
  const lines: string[] = [];
  let succeeded = 0;
  let failed = 0;
  for (const { id, card_id } of dashcards) {
    const errorContext = errors.get(id);
    if (errorContext) {
      lines.push(
        JSON.stringify({
          type: "card-error",
          dashcard_id: id,
          card_id,
          status: "failed",
          error: errorContext.error,
          ...(errorContext.error_type != null && {
            error_type: errorContext.error_type,
          }),
          ...(errorContext.error_is_curated != null && {
            error_is_curated: errorContext.error_is_curated,
          }),
          ...(errorContext.json_query != null && {
            json_query: errorContext.json_query,
          }),
          data: { cols: [], rows: [] },
        }),
      );
      failed++;
    } else {
      lines.push(
        JSON.stringify({
          type: "card-begin",
          dashcard_id: id,
          card_id,
          data: dataset.data,
        }),
      );
      lines.push(
        JSON.stringify({
          type: "card-rows",
          dashcard_id: id,
          card_id,
          rows: dataset.data?.rows ?? [],
        }),
      );
      lines.push(
        JSON.stringify({
          type: "card-end",
          dashcard_id: id,
          card_id,
          row_count: dataset.data?.rows?.length ?? 0,
          status: "completed",
          data: dataset.data,
        }),
      );
      succeeded++;
    }
  }
  lines.push(
    JSON.stringify({
      type: "complete",
      total: dashcards.length,
      succeeded,
      failed,
    }),
  );
  return lines.join("\n") + "\n";
}

// fetch-mock cannot round-trip a ReadableStream body through jsdom's Response
// polyfill (the body ends up as null), so we monkey-patch global.fetch for
// batch URLs. Non-matching requests fall through to whatever fetch-mock
// installed.
//
// Each test invokes this helper; it records calls into `batchCalls` which is
// returned so tests can assert against them. `global.fetch` is reset to
// fetch-mock at the start of every test via `fetchMock.mockGlobal()` in
// jest-setup-env.js, so there is no cleanup to do.
type FetchLike = typeof fetch;
type BatchCall = { url: string; init?: RequestInit };

function patchFetchForBatch(
  matches: (url: string) => boolean,
  build: () => string,
): BatchCall[] {
  const calls: BatchCall[] = [];
  const delegate: FetchLike = global.fetch as FetchLike;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (matches(url)) {
      calls.push({ url, init });
      const encoder = new TextEncoder();
      const body = build();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      });
      return {
        ok: true,
        status: 200,
        body: stream,
      } as unknown as Response;
    }
    return delegate(input, init);
  }) as FetchLike;
  return calls;
}

export function setupDashboardCardQueryBatchEndpoint(
  dashboardId: DashboardId,
  dashcards: BatchDashcardRef[],
  dataset: Dataset = createMockDataset(),
): BatchCall[] {
  const pathname = `/api/dashboard/${dashboardId}/card-query-batch`;
  return patchFetchForBatch(
    (url) => url.includes(pathname),
    () => buildCardQueryBatchNdjson(dashcards, dataset),
  );
}

export function setupPublicDashboardCardQueryBatchEndpoint(
  dashboardId: DashboardId,
  dashcards: BatchDashcardRef[],
  dataset: Dataset = createMockDataset(),
): BatchCall[] {
  const pathname = `/api/public/dashboard/${dashboardId}/card-query-batch`;
  return patchFetchForBatch(
    (url) => url.includes(pathname),
    () => buildCardQueryBatchNdjson(dashcards, dataset),
  );
}

export function setupEmbedDashboardCardQueryBatchEndpointByToken(
  token: string,
  dashcards: BatchDashcardRef[],
  dataset: Dataset = createMockDataset(),
): BatchCall[] {
  const pathname = `/api/embed/dashboard/${token}/card-query-batch`;
  return patchFetchForBatch(
    (url) => url.includes(pathname),
    () => buildCardQueryBatchNdjson(dashcards, dataset),
  );
}
