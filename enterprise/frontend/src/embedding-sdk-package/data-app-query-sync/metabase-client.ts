import type { DataAppMetadata, MetabaseCard } from "./types";

export class MetabaseClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    const url = new URL(`/api/${pathname.replace(/^\//, "")}`, this.baseUrl);
    const method = (init?.method ?? "GET").toUpperCase();
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- The CLI protocol error names the remote service.
        `Metabase returned ${response.status} for ${method} ${url}: ${await response.text()}`,
      );
    }
    const body: unknown = await response.json();
    // Endpoint methods define the trusted response shape.
    return body as T;
  }

  ensureDraft(slug: string) {
    return this.request<DataAppMetadata>(
      `apps/${encodeURIComponent(slug)}/draft`,
      {
        method: "POST",
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

  reconcilePermissions(slug: string, databaseIds: number[]) {
    return this.request<DataAppMetadata>(
      `apps/${encodeURIComponent(slug)}/query-sync/permissions`,
      { method: "PUT", body: JSON.stringify({ database_ids: databaseIds }) },
    );
  }

  getCard(id: number) {
    return this.request<MetabaseCard>(`card/${id}`);
  }

  createCard(
    name: string,
    collectionId: number,
    datasetQuery: Record<string, unknown>,
  ) {
    return this.request<MetabaseCard>("card", {
      method: "POST",
      body: JSON.stringify({
        name,
        type: "question",
        dataset_query: datasetQuery,
        display: "table",
        visualization_settings: {},
        collection_id: collectionId,
      }),
    });
  }

  updateCard(
    id: number,
    name: string,
    collectionId: number,
    datasetQuery: Record<string, unknown>,
  ) {
    return this.request<MetabaseCard>(`card/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        type: "question",
        dataset_query: datasetQuery,
        collection_id: collectionId,
      }),
    });
  }
}
