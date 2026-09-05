/**
 * Helpers for the model-indexes spec port. New helpers only; everything else
 * (createQuestion, commandPalette*, openColumnOptions, sidebar/popover, …) is
 * imported read-only from the shared support modules by the spec.
 *
 * Ports:
 * - createModelIndex (e2e/support/helpers/e2e-model-index-helper.js)
 * - a GET /api/card/:id counter (the spec's `@cardGet` intercept +
 *   `expectCardQueries` assertion)
 * - a search-index readiness poll for freshly created indexed values (the
 *   indexed-entity search index is populated out-of-band from the
 *   POST /api/model-index response, so a search fired too early misses it)
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { escapeRegExp } from "./text";

/**
 * Select a column in the model metadata editor. The shared
 * `models-metadata.openColumnOptions` clicks the outer `header-cell`, but the
 * editor drives its selection off the `onFocus` handler of the inner
 * `model-column-header-content` element (DatasetEditorInner
 * renderSelectableTableColumnHeader) — a click on the outer cell doesn't
 * reliably move focus there (it fails for the Products model's Title column),
 * so focus that element directly. Focus is the exact event selection listens
 * for, and it auto-scrolls the column into view.
 */
export async function selectModelColumn(page: Page, column: string) {
  const header = page
    .getByTestId("model-column-header-content")
    .filter({ hasText: new RegExp(`^${escapeRegExp(column)}$`) })
    .first();
  await expect(header).toBeVisible();
  await header.focus();
  await expect(
    page.getByTestId("sidebar-right").getByLabel("Display name", { exact: true }),
  ).toHaveValue(column);
}

/**
 * Port of H.createModelIndex({ modelId, pkName, valueName }): field ids are
 * non-deterministic, so look them up from the model's query metadata, then POST
 * the index. Mirrors the Cypress helper's assertions on the response shape.
 */
export async function createModelIndex(
  api: MetabaseApi,
  { modelId, pkName, valueName }: {
    modelId: number;
    pkName: string;
    valueName: string;
  },
) {
  const metadataResponse = await api.get(
    `/api/table/card__${modelId}/query_metadata`,
  );
  const { fields } = (await metadataResponse.json()) as {
    fields: { name: string; id: number }[];
  };
  const pkRef = ["field", fields.find((f) => f.name === pkName)!.id, null];
  const valueRef = ["field", fields.find((f) => f.name === valueName)!.id, null];

  const response = await api.post("/api/model-index", {
    pk_ref: pkRef,
    value_ref: valueRef,
    model_id: modelId,
  });
  const body = (await response.json()) as { state: string; id: number };
  expect(body.state).toBe("indexed");
  expect(body.id).toBe(1);
}

/**
 * Wait until a freshly indexed value is searchable. Creating a model index
 * populates the indexed-entity search entries out-of-band from the POST
 * response, so a command-palette search fired immediately can miss them
 * (the FE renders a permanent empty state and never re-queries). Poll the
 * search endpoint (nudging a force-reindex once) until the value appears.
 */
export async function waitForIndexedValueSearchable(
  api: MetabaseApi,
  query: string,
) {
  const deadline = Date.now() + 30_000;
  let forcedReindex = false;
  while (Date.now() < deadline) {
    const response = await api.get(
      `/api/search?q=${encodeURIComponent(query)}&models=indexed-entity&limit=1`,
      { failOnStatusCode: false },
    );
    if (response.ok()) {
      const body = await response.json().catch(() => ({ data: [] }));
      if ((body.data ?? []).length > 0) {
        return;
      }
    }
    if (!forcedReindex) {
      forcedReindex = true;
      await api.post("/api/search/force-reindex", undefined, {
        failOnStatusCode: false,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Port of the spec's `@cardGet` intercept + `expectCardQueries` assertion:
 * count GET /api/card/:id responses (single path segment — the Cypress glob
 * `/api/card/*` does not match `/api/card/:id/query_metadata`). Attach at the
 * start of the test; the returned `count()` reads the running total.
 */
export function trackCardGets(page: Page): { count: () => number } {
  let n = 0;
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      /^\/api\/card\/[^/]+$/.test(new URL(response.url()).pathname)
    ) {
      n += 1;
    }
  });
  return { count: () => n };
}
