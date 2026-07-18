/**
 * Helpers unique to the embedding-reproductions spec port
 * (e2e/test/scenarios/embedding/embedding-reproductions.cy.spec.js). NEW
 * helpers only (parallel-agent rule: no edits to shared modules).
 *
 * Almost everything this spec needs already exists — visit/modal/publish
 * helpers in support/embedding-dashboard.ts + support/embedding.ts, the iframe
 * harness (visitStaticEmbedUrl / visitFullAppEmbeddingUrl), sandboxTable,
 * toggleFilterWidgetValues, visitPublicDashboard / visitPublicQuestion. This
 * module carries only the handful that had no home:
 *
 * - getIframeBody: the static-embedding modal's *preview* iframe as a
 *   FrameLocator (port of H.getIframeBody, `cy.iframe("iframe")`).
 * - tableInteractiveHeader: port of H.tableInteractiveHeader.
 * - setDefaultValueForLockedFilter: the spec-local helper in issue 15860.
 * - createDashboardWithQuestions / createModelFromTableName /
 *   moveCardToCollection / getFieldIdByName: api helpers upstream reaches for
 *   via H.* that the existing PW ports don't cover in the exact shape needed.
 * - holdEmbedRoute: the Playwright equivalent of Cypress's `defer()` +
 *   `res.setDelay(MINUTE)` intercepts (issue 8490 / 50182) — hold an
 *   /api/embed/* response until release() so the loading state can be asserted.
 *
 * TODO(consolidation): the api helpers overlap embedding-dashboard.ts and
 * interactive-embedding.ts — fold into one embedding module in the pass.
 */
import type { FrameLocator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createQuestionAndAddToDashboard } from "./dashboard-card-repros";
import {
  createDashboard,
  type NativeQuestionDetails,
  type StructuredQuestionDetails,
} from "./embedding-dashboard";

/** Local mirror of embedding-dashboard.ts's (non-exported) DashboardDetails. */
type DashboardDetails = { name?: string } & Record<string, unknown>;
import { getTableId } from "./interactive-embedding";
import { popover } from "./ui";

type Scope = Page | FrameLocator;

/**
 * Port of H.getIframeBody: the (single) iframe on the page as a FrameLocator.
 * Used for the static-embedding modal's live preview iframe.
 */
export function getIframeBody(page: Page): FrameLocator {
  return page.frameLocator("iframe");
}

/** Port of H.tableInteractiveHeader (`cy.findByTestId("table-header")`). */
export function tableInteractiveHeader(scope: Scope) {
  return scope.getByTestId("table-header");
}

/**
 * Port of the spec-local setDefaultValueForLockedFilter (issue 15860): in the
 * "Previewing locked parameters" section, open the named filter, type the ID
 * value and confirm.
 */
export async function setDefaultValueForLockedFilter(
  page: Page,
  filter: string,
  value: number | string,
) {
  await page
    .getByText("Previewing locked parameters", { exact: true })
    .locator("xpath=..")
    .getByText(filter, { exact: true })
    .click({ force: true });

  await page.getByPlaceholder("Enter an ID").pressSequentially(`${value}`);
  await page.keyboard.press("Enter");
  await popover(page).getByRole("button", { name: "Add filter" }).click();
}

/**
 * Port of H.createDashboardWithQuestions (api/createDashboardWithQuestions.ts):
 * create the dashboard (holding back embedding fields), then create each
 * question and append it to the dashboard. Returns the dashboard plus the
 * created questions (whose ids the caller reads).
 */
export async function createDashboardWithQuestions(
  api: MetabaseApi,
  {
    dashboardName,
    dashboardDetails,
    questions,
    cards,
  }: {
    dashboardName?: string;
    dashboardDetails?: DashboardDetails;
    questions: (StructuredQuestionDetails | NativeQuestionDetails)[];
    cards?: Record<string, unknown>[];
  },
): Promise<{
  dashboard: { id: number } & Record<string, unknown>;
  questions: { id: number }[];
}> {
  const dashboard = await createDashboard(api, {
    name: dashboardName,
    ...dashboardDetails,
  });

  const created: { id: number }[] = [];
  for (let index = 0; index < questions.length; index++) {
    const details = questions[index] as Record<string, unknown>;
    const dashcard = await createQuestionAndAddToDashboard(
      api,
      details,
      dashboard.id,
      cards ? cards[index] : undefined,
    );
    // POST /api/card ignores enable_embedding/embedding_params/type — the
    // Cypress `question()` helper applies them with a follow-up PUT, so mirror
    // that (8490's standalone question embed needs enable_embedding on the card).
    if (details.enable_embedding || details.type === "model" || details.type === "metric") {
      await api.put(`/api/card/${dashcard.card_id}`, {
        type: details.type ?? "question",
        enable_embedding: details.enable_embedding ?? false,
        embedding_params: details.embedding_params ?? null,
      });
    }
    // The appended dashcard's card_id is the created question's id.
    created.push({ id: dashcard.card_id });
  }

  return { dashboard, questions: created };
}

/**
 * Port of H.createModelFromTableName (e2e-qa-databases-helpers.js) returning
 * the created model's id (interactive-embedding.ts's copy doesn't return it).
 */
export async function createModelFromTableName(
  api: MetabaseApi,
  {
    tableName,
    modelName = "Test Action Model",
    databaseId = 2,
  }: { tableName: string; modelName?: string; databaseId?: number },
): Promise<{ id: number }> {
  const tableId = await getTableId(api, { databaseId, name: tableName });
  const response = await api.post("/api/card", {
    name: modelName,
    type: "model",
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      query: { "source-table": tableId },
      database: databaseId,
    },
  });
  return (await response.json()) as { id: number };
}

/** Port of the spec-local moveToCollection (issue 51934): PUT the card's
 * collection_id. */
export async function moveCardToCollection(
  api: MetabaseApi,
  cardId: number,
  collectionId: number,
) {
  await api.put(`/api/card/${cardId}`, { collection_id: collectionId });
}

/**
 * Port of H.withDatabase's field-id lookup (e2e-database-metadata-helpers.ts),
 * reduced to a single field: GET the database metadata and resolve the id of
 * `fieldName` in `tableName` (both matched case-insensitively, like the
 * upstream uppercase map).
 */
export async function getFieldIdByName(
  api: MetabaseApi,
  {
    databaseId,
    tableName,
    fieldName,
  }: { databaseId: number; tableName: string; fieldName: string },
): Promise<number> {
  const response = await api.get(
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  );
  const body = (await response.json()) as {
    tables?: {
      name: string;
      fields?: { id: number; name: string }[];
    }[];
  };
  const table = body.tables?.find(
    (table) => table.name.toUpperCase() === tableName.toUpperCase(),
  );
  const field = table?.fields?.find(
    (field) => field.name.toUpperCase() === fieldName.toUpperCase(),
  );
  if (typeof field?.id !== "number") {
    throw new Error(`Field "${fieldName}" not found in table "${tableName}"`);
  }
  return field.id;
}

/**
 * Playwright equivalent of the spec's `cy.intercept(..., () => deferred)` /
 * `res.setDelay(MINUTE)` embed intercepts (issues 8490 / 50182): route every
 * request whose URL matches `predicate` through a gate that only proceeds once
 * `release()` is called, so the loading state can be asserted before the
 * response lands. Unreleased at test end, the pending request is simply
 * abandoned when the page navigates away / closes.
 */
export function holdEmbedRoute(
  page: Page,
  predicate: (url: URL) => boolean,
): { release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  void page.route(
    (url) => predicate(url),
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  return { release: () => release() };
}
