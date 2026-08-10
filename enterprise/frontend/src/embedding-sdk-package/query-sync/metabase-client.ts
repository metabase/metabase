import type { DataAppMetadata, MetabaseCard } from "./types";

export class MetabaseApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class MetabaseClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    const requestUrl = new URL(
      `/api/${pathname.replace(/^\//, "")}`,
      this.baseUrl,
    );
    const method = (init?.method ?? "GET").toUpperCase();
    const response = await fetch(requestUrl, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const message = await response.text();
      throw new MetabaseApiError(
        response.status,
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- CLI protocol error names the remote service.
        `Metabase returned ${response.status} for ${method} ${requestUrl}: ${message}`,
      );
    }
    if (response.status === 204) {
      // The generic return type is controlled by the caller for no-content requests.
      return undefined as T;
    }
    const body: unknown = await response.json();
    // The endpoint-specific methods define the trusted API response contract.
    return body as T;
  }

  prepareQuerySync(slug: string) {
    return this.request<DataAppMetadata>(
      `apps/${encodeURIComponent(slug)}/query-sync`,
      { method: "POST" },
    );
  }

  reconcileQuerySyncPermissions(slug: string, databaseIds: number[]) {
    return this.request<DataAppMetadata>(
      `apps/${encodeURIComponent(slug)}/query-sync/permissions`,
      {
        method: "PUT",
        body: JSON.stringify({ database_ids: databaseIds }),
      },
    );
  }

  resolveQuery(slug: string, query: Record<string, unknown>) {
    return this.request<{
      database_id: number;
      dataset_query: Record<string, unknown>;
    }>(`apps/${encodeURIComponent(slug)}/query`, {
      method: "POST",
      body: JSON.stringify({ stages: [query] }),
    });
  }

  getCard(id: number) {
    return this.request<MetabaseCard>(`card/${id}`);
  }

  createCard(input: {
    name: string;
    collectionId: number;
    datasetQuery: Record<string, unknown>;
  }) {
    return this.request<MetabaseCard>("card", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        type: "question",
        dataset_query: input.datasetQuery,
        display: "table",
        visualization_settings: {},
        collection_id: input.collectionId,
      }),
    });
  }

  updateCard(
    id: number,
    input: {
      name: string;
      collectionId: number;
      datasetQuery: Record<string, unknown>;
    },
  ) {
    return this.request<MetabaseCard>(`card/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: input.name,
        type: "question",
        dataset_query: input.datasetQuery,
        collection_id: input.collectionId,
      }),
    });
  }

  deleteCard(id: number) {
    return this.request<void>(`card/${id}`, { method: "DELETE" });
  }
}
