import { APIRequestContext, expect } from "@playwright/test";

import { SAMPLE_DB_ID } from "./sample-data";

type RequestOptions = {
  data?: unknown;
  failOnStatusCode?: boolean;
};

/**
 * HTTP client mirroring cy.request semantics: requests run as the currently
 * signed-in user (via the X-Metabase-Session header) and fail loudly on
 * non-2xx unless failOnStatusCode: false.
 */
export class MetabaseApi {
  constructor(
    private request: APIRequestContext,
    private getSessionId: () => string | undefined,
  ) {}

  get requestContext(): APIRequestContext {
    return this.request;
  }

  async fetch(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    { data, failOnStatusCode = true }: RequestOptions = {},
  ) {
    const sessionId = this.getSessionId();
    const response = await this.request.fetch(url, {
      method,
      data,
      headers: sessionId ? { "X-Metabase-Session": sessionId } : {},
    });
    if (failOnStatusCode) {
      expect(
        response.ok(),
        `${method} ${url} -> ${response.status()} ${await response
          .text()
          .catch(() => "")}`,
      ).toBeTruthy();
    }
    return response;
  }

  get(url: string, options?: RequestOptions) {
    return this.fetch("GET", url, options);
  }

  post(url: string, data?: unknown, options?: Omit<RequestOptions, "data">) {
    return this.fetch("POST", url, { ...options, data });
  }

  put(url: string, data?: unknown, options?: Omit<RequestOptions, "data">) {
    return this.fetch("PUT", url, { ...options, data });
  }

  // === ports of e2e/support/helpers/e2e-setup-helpers.js ===

  /** Restore an app-DB snapshot (H2 RUNSCRIPT on the backend). */
  async restore(name = "default") {
    await this.post("/api/testing/reset-throttlers", undefined, {
      failOnStatusCode: false,
    });
    await this.post(`/api/testing/restore/${name}`);
  }

  async snapshot(name: string) {
    await this.post(`/api/testing/snapshot/${name}`);
  }

  // === ports of e2e/support/helpers/api/* ===

  async updateSetting(setting: string, value: unknown) {
    await this.put(`/api/setting/${encodeURIComponent(setting)}`, { value });
  }

  /** Port of e2e-token-helpers.ts. Reads the same env vars as Cypress. */
  async activateToken(
    tokenName: "bleeding-edge" | "starter" | "pro-cloud" | "pro-self-hosted",
  ) {
    const token = resolveToken(tokenName);
    if (!token) {
      throw new Error(
        `Missing env var for the "${tokenName}" token — set ${tokenEnvName(tokenName)} (or CYPRESS_${tokenEnvName(tokenName)})`,
      );
    }
    await this.put(
      "/api/setting/premium-embedding-token",
      { value: token },
      { failOnStatusCode: false },
    );
  }

  async createQuestion(details: {
    name?: string;
    type?: string;
    display?: string;
    collection_id?: number;
    database?: number;
    query: Record<string, unknown>;
  }) {
    const {
      name = "test question",
      type = "question",
      display = "table",
      database = SAMPLE_DB_ID,
      query,
      ...rest
    } = details;
    const response = await this.post("/api/card", {
      name,
      type,
      display,
      visualization_settings: {},
      ...rest,
      dataset_query: { type: "query", query, database },
    });
    return (await response.json()) as { id: number; entity_id: string };
  }

  async bookmarkCard(id: number) {
    await this.post(`/api/bookmark/card/${id}`);
  }

  async createDashboard(details: { name?: string } = {}) {
    const { name = "Test Dashboard", ...rest } = details;
    const response = await this.post("/api/dashboard", { name, ...rest });
    return (await response.json()) as { id: number };
  }

  /** Port of api/createQuestionAndDashboard.ts. */
  async createQuestionAndDashboard({
    questionDetails,
    dashboardDetails,
    cardDetails,
  }: {
    questionDetails: Parameters<MetabaseApi["createQuestion"]>[0];
    dashboardDetails?: { name?: string };
    cardDetails?: Record<string, unknown>;
  }) {
    const { id: questionId } = await this.createQuestion(questionDetails);
    const { id: dashboardId } = await this.createDashboard(dashboardDetails);
    const response = await this.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        {
          id: -1,
          card_id: questionId,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          ...cardDetails,
        },
      ],
    });
    const body = await response.json();
    return { questionId, dashboardId, dashcards: body.dashcards };
  }

  /** Port of api/createLibrary.ts (EE): initialize the library collection. */
  async createLibrary() {
    await this.post("/api/ee/library");
    const response = await this.get("/api/ee/library");
    await expect(async () => {
      const tree = await this.get(
        "/api/collection/tree?exclude-other-user-collections=true&exclude-archived=true&include-library=true",
      );
      const collections = (await tree.json()) as {
        type?: string;
        children?: { type?: string }[];
      }[];
      const library = collections.find(({ type }) => type === "library");
      const hasRoots =
        library?.children?.some(({ type }) => type === "library-data") &&
        library?.children?.some(({ type }) => type === "library-metrics");
      expect(hasRoots).toBeTruthy();
    }).toPass({ timeout: 10_000 });
    return response.json();
  }

  /** Port of api/publishTables.ts (EE). */
  async publishTables({
    table_ids,
    collection_id,
  }: {
    table_ids: number[];
    collection_id?: number;
  }) {
    let targetCollectionId = collection_id;
    if (targetCollectionId == null) {
      const library = await (await this.get("/api/ee/library")).json();
      targetCollectionId = library.effective_children?.find(
        (collection: { type?: string }) =>
          collection.type === "library-data",
      )?.id;
    }
    await this.post("/api/ee/data-studio/table/publish-tables", {
      table_ids,
      collection_id: targetCollectionId,
    });
  }

  async getDashboard(id: number) {
    const response = await this.get(`/api/dashboard/${id}`, {
      failOnStatusCode: false,
    });
    return {
      status: response.status(),
      body: response.ok() ? await response.json() : {},
    };
  }
}

function tokenEnvName(tokenName: string): string {
  switch (tokenName) {
    case "bleeding-edge":
      return "MB_ALL_FEATURES_TOKEN";
    case "starter":
      return "MB_STARTER_CLOUD_TOKEN";
    case "pro-cloud":
      return "MB_PRO_CLOUD_TOKEN";
    case "pro-self-hosted":
      return "MB_PRO_SELF_HOSTED_TOKEN";
    default:
      throw new Error(`Unknown token name: ${tokenName}`);
  }
}

export function resolveToken(tokenName: string): string | undefined {
  const envName = tokenEnvName(tokenName);
  return process.env[`CYPRESS_${envName}`] ?? process.env[envName];
}
