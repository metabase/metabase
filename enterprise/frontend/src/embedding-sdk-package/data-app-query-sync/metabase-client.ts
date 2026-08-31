import type {
  DataAppMetadata,
  DataAppMetric,
  MetabaseAction,
  MetabaseCard,
} from "./types";

export class MetabaseApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Resolves to `null` on a confirmed 404, so a caller can treat "gone" as
 * recoverable. Any other failure still throws: only a 404 proves the entity is
 * absent rather than unreachable.
 */
export const orNullOn404 = async <T>(
  request: Promise<T>,
): Promise<T | null> => {
  try {
    return await request;
  } catch (error) {
    if (error instanceof MetabaseApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export class MetabaseClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    const baseUrl = new URL(this.baseUrl);
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/?$/, "/")}api/${pathname.replace(/^\//, "")}`;
    const requestUrl = baseUrl;
    const method = (init?.method ?? "GET").toUpperCase();
    const response = await fetch(requestUrl, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(60_000),
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

  ensureDraft(slug: string) {
    return this.request<DataAppMetadata>(
      `apps/${encodeURIComponent(slug)}/draft`,
      { method: "POST" },
    );
  }

  async resolveQuery(slug: string, query: Record<string, unknown>) {
    const resolved = await this.request<{
      database_id: number;
      dataset_query: Record<string, unknown>;
      metrics?: DataAppMetric[];
    }>(`apps/${encodeURIComponent(slug)}/query`, {
      method: "POST",
      body: JSON.stringify({ stages: [query] }),
    });
    return { ...resolved, metrics: resolved.metrics ?? [] };
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
        archived: false,
      }),
    });
  }

  moveCardToCollection(id: number, collectionId: number) {
    return this.request<MetabaseCard>(`card/${id}`, {
      method: "PUT",
      body: JSON.stringify({ collection_id: collectionId }),
    });
  }

  deleteCard(id: number) {
    return this.request<void>(`card/${id}`, { method: "DELETE" });
  }

  createModel(input: ModelInput) {
    return this.request<MetabaseCard>("card", {
      method: "POST",
      body: JSON.stringify(modelBody(input)),
    });
  }

  createMetric(input: MetricInput) {
    return this.request<MetabaseCard>("card", {
      method: "POST",
      body: JSON.stringify(metricBody(input)),
    });
  }

  updateMetric(id: number, input: MetricInput) {
    return this.request<MetabaseCard>(`card/${id}`, {
      method: "PUT",
      body: JSON.stringify(metricBody(input)),
    });
  }

  updateModel(id: number, input: ModelInput) {
    return this.request<MetabaseCard>(`card/${id}`, {
      method: "PUT",
      body: JSON.stringify(modelBody(input)),
    });
  }

  getAction(id: number) {
    return this.request<MetabaseAction>(`action/${id}`);
  }

  createAction(body: Record<string, unknown>) {
    return this.request<MetabaseAction>("action", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updateAction(id: number, body: Record<string, unknown>) {
    return this.request<MetabaseAction>(`action/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  deleteAction(id: number) {
    return this.request<void>(`action/${id}`, { method: "DELETE" });
  }
}

interface ModelInput {
  name: string;
  collectionId: number;
  datasetQuery: Record<string, unknown>;
  display: string;
  visualizationSettings: Record<string, unknown>;
  description: string | null;
}

interface MetricInput {
  name: string;
  collectionId: number;
  datasetQuery: Record<string, unknown>;
  display: string;
  visualizationSettings: Record<string, unknown>;
  description: string | null;
}

const modelBody = (input: ModelInput) => ({
  name: input.name,
  type: "model",
  archived: false,
  dataset_query: input.datasetQuery,
  display: input.display,
  visualization_settings: input.visualizationSettings,
  description: input.description,
  collection_id: input.collectionId,
});

const metricBody = (input: MetricInput) => ({
  name: input.name,
  type: "metric",
  dataset_query: input.datasetQuery,
  display: input.display,
  visualization_settings: input.visualizationSettings,
  description: input.description,
  collection_id: input.collectionId,
});
