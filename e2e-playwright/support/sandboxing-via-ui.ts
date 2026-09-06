/**
 * Per-spec helpers for tests/sandboxing-via-ui.spec.ts — port of
 * e2e/test/scenarios/permissions/sandboxing/sandboxing-via-ui.cy.spec.ts and
 * the parts of its sibling helper file
 * e2e/test/scenarios/permissions/sandboxing/helpers/e2e-sandboxing-helpers.ts
 * that spec actually uses.
 *
 * New module per porting rule 9 — no shared support file is edited. Read-only
 * reuse of: admin-permissions (modifyPermission), command-palette
 * (saveChangesToPermissions), table-collection-permissions
 * (blockUserGroupPermissions), factories, notebook, ui, dashboard-core.
 *
 * ── The auth model, which is the whole ballgame on this spec ───────────────
 *
 * Upstream's `signInAs` is `cy.request("POST", "/api/session", …)`. In Cypress
 * that sets the browser session cookie AND makes every subsequent `cy.request`
 * run as that user — and BOTH halves are load-bearing here: the dashboard is
 * rendered as the sandboxed user, and `getCardResponses` / the field-values and
 * parameter-values probes are `cy.request`s that MUST also run as the sandboxed
 * user or the sandboxing assertions measure nothing.
 *
 * The Playwright harness cannot express that with `mb.api`, and the obvious
 * route is actively dangerous. Measured on this backend (slot 2, jar 751c2a9):
 *
 *   signInWithCredentials(context, mb.api, …)  →  mb.api runs as the NEW user
 *   mb.signInAsAdmin()                         →  mb.api STILL the new user
 *
 * because the `POST /api/session` goes through `mb.api`'s APIRequestContext,
 * the Set-Cookie lands in that context's cookie jar, and Metabase's
 * `wrap-session-key` resolves the cookie BEFORE the `X-Metabase-Session`
 * header — so the header `mb.signInAsAdmin()` updates is simply ignored.
 * Admin setup then silently executes as a sandboxed user.
 *
 * `signInAs` below avoids it: the session POST goes through a THROWAWAY
 * APIRequestContext which is disposed immediately, so no cookie ever enters
 * `mb.api`'s jar. Measured on the same backend:
 *
 *   signInAs(...)  →  returned api = new user, mb.api = STILL admin,
 *                     browser = new user
 *
 * Every helper here therefore takes its `api` explicitly, and
 * `assertRunningAs` pins which user it actually resolved to.
 */
import { expect, request as playwrightRequest } from "@playwright/test";
import type { BrowserContext, Page, Response } from "@playwright/test";

import { MetabaseApi } from "./api";
import { modifyPermission } from "./admin-permissions";
import { saveChangesToPermissions } from "./command-palette";
import { createCollection } from "./dashboard-core";
import { createQuestion, createDashboardWithQuestions } from "./factories";
import type { StructuredQuestionDetails } from "./factories";
import {
  enterCustomColumnDetails,
  entityPickerModal,
  getNotebookStep,
  openNotebook,
  visualize,
} from "./notebook";
import { adhocQuestionHash } from "./permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { blockUserGroupPermissions } from "./table-collection-permissions";
import { icon, modal, popover, visitQuestion } from "./ui";

// ── fixture ids ────────────────────────────────────────────────────────────
// Table/field ids are READ from e2e/support/cypress_sample_database.json at
// import time (via ./sample-data), never typed in by hand.
const { PRODUCTS_ID, ORDERS_ID, ORDERS, PRODUCTS, PEOPLE_ID, PEOPLE } =
  SAMPLE_DATABASE;

export { PRODUCTS_ID, ORDERS_ID, ORDERS, PRODUCTS, PEOPLE_ID, PEOPLE };

/**
 * Port of USER_GROUPS (e2e/support/cypress_data.js:42-49). These are literals
 * upstream too — not generated fixture data — so they are mirrored here with
 * the source line, and `assertUserGroupIds` re-checks them against the live
 * instance at setup time so a drifted id fails loudly instead of silently
 * granting the wrong group.
 *
 * ⚠️ DATA_GROUP is 6. The `4` next door belongs to MAGIC_USER_GROUPS
 * (DATA_ANALYSTS_GROUP, cypress_data.js:51-54) — a different map. Sandboxing
 * applied to the wrong group enforces nothing while still going green.
 */
export const ALL_USERS_GROUP = 1;
export const ADMIN_GROUP = 2;
export const COLLECTION_GROUP = 5;
export const DATA_GROUP = 6;
export const READONLY_GROUP = 7;

/** Cross-check the mirrored group ids against the running instance. */
export async function assertUserGroupIds(api: MetabaseApi) {
  const groups = (await (await api.get("/api/permissions/group")).json()) as {
    id: number;
    name: string;
  }[];
  const byName = (name: string) =>
    groups.find((group) => group.name === name)?.id;
  expect(byName("All Users"), "ALL_USERS_GROUP").toBe(ALL_USERS_GROUP);
  expect(byName("Administrators"), "ADMIN_GROUP").toBe(ADMIN_GROUP);
  expect(byName("collection"), "COLLECTION_GROUP").toBe(COLLECTION_GROUP);
  expect(byName("data"), "DATA_GROUP").toBe(DATA_GROUP);
  expect(byName("readonly"), "READONLY_GROUP").toBe(READONLY_GROUP);
}

// ── question/model definitions (e2e-sandboxing-helpers.ts:24-171) ──────────

const customColumnTypeToFormula = {
  booleanExpr: '[Category]="Gizmo"',
  stringExpr: 'concat("Category is ",[Category])',
  numberExpr: 'if([Category] = "Gizmo", 1, 0)',
  booleanLiteral: "true",
  stringLiteral: '"fixed literal string"',
  numberLiteral: "1",
} as const;

export type CustomColumnType = keyof typeof customColumnTypeToFormula;
export type CustomViewType = "Question" | "Model";

export type SandboxPolicy = {
  filterTableBy: "column" | "custom_view";
  customViewType?: CustomViewType;
  customViewName?: string;
  customColumnType?: CustomColumnType;
  filterColumn?: string;
};

const customColumnTypes = Object.keys(
  customColumnTypeToFormula,
) as CustomColumnType[];

const baseQuery = {
  "source-table": PRODUCTS_ID,
  limit: 20,
};

const gizmoFilter = ["=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"];

export const questionCustomView: StructuredQuestionDetails = {
  name: "Question showing the products whose category is Gizmo (custom view)",
  query: { ...baseQuery, filter: gizmoFilter },
};

export const modelCustomView: StructuredQuestionDetails = {
  name: "Model showing the products whose category is Gizmo (custom view)",
  query: { ...baseQuery, filter: gizmoFilter },
  type: "model",
};

const customViewDefinitions = [questionCustomView, modelCustomView];

const savedQuestion: StructuredQuestionDetails = {
  name: "Question showing all products",
  query: baseQuery,
};

const model: StructuredQuestionDetails = {
  name: "Model showing all products",
  query: baseQuery,
  type: "model",
};

const ordersJoinedToProducts: StructuredQuestionDetails = {
  name: "Question with Orders joined to Products",
  query: {
    ...baseQuery,
    joins: [
      {
        strategy: "left-join",
        alias: "Products",
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        "source-table": PRODUCTS_ID,
        fields: "all",
      },
    ],
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
    "source-table": ORDERS_ID,
  },
};

const ordersImplicitlyJoinedToProducts: StructuredQuestionDetails = {
  name: "Question with Orders implicitly joined to Products",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
      ["field", ORDERS.ID, null],
      ["field", ORDERS.TOTAL, null],
      ["field", ORDERS.PRODUCT_ID, null],
    ],
  },
};

const multiStageQuestion: StructuredQuestionDetails = {
  name: "Multi-stage question",
  query: {
    "source-query": {
      "source-query": {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
};

const questionData: StructuredQuestionDetails[] = [
  savedQuestion,
  model,
  ordersJoinedToProducts,
  ordersImplicitlyJoinedToProducts,
  multiStageQuestion,
];

export const adhocQuestionData = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query" as const,
    query: { "source-table": PRODUCTS_ID },
  },
};

// ── users (e2e-sandboxing-helpers.ts:270-302) ──────────────────────────────

export type NormalUser = {
  email: string;
  password: string;
  user_group_memberships?: { id: number; is_group_manager: boolean }[];
  login_attributes?: Record<string, string>;
} & Record<string, unknown>;

const viewerGroups = [
  { id: ALL_USERS_GROUP, is_group_manager: false },
  { id: DATA_GROUP, is_group_manager: false },
  { id: COLLECTION_GROUP, is_group_manager: false },
];

/** Non-admin who should only see Gizmos once sandboxing is applied. */
export const gizmoViewer: NormalUser = {
  email: "alice@gizmos.com",
  password: "--------",
  user_group_memberships: viewerGroups,
};

/** Non-admin who should only see Widgets once sandboxing is applied. */
export const widgetViewer: NormalUser = {
  email: "bob@widgets.com",
  password: "--------",
  user_group_memberships: viewerGroups,
};

/** Port of cy.createUserFromRawData. Inlined rather than imported from
 * support/sandboxing-via-api.ts so a concurrently-edited sibling module cannot
 * change this spec's setup underneath it. */
export async function createUserFromRawData(
  api: MetabaseApi,
  user: Record<string, unknown>,
): Promise<{ id: number }> {
  const response = await api.post("/api/user", user);
  const created = (await response.json()) as { id: number };
  await api.put(`/api/user/${created.id}/modal/qbnewb`, {});
  return created;
}

/**
 * Port of the helper `signInAs` — see the module header for why the session
 * POST goes through a throwaway request context.
 *
 * Returns an API client bound to the new session. `mb.api` is deliberately
 * left alone (and stays admin); anything that must run AS this user has to use
 * the returned client.
 */
export async function signInAs(
  context: BrowserContext,
  baseUrl: string,
  user: NormalUser,
  api: MetabaseApi,
): Promise<MetabaseApi> {
  const throwaway = await playwrightRequest.newContext({ baseURL: baseUrl });
  let sessionId: string;
  try {
    const response = await throwaway.post("/api/session", {
      data: { username: user.email, password: user.password },
    });
    expect(
      response.ok(),
      `POST /api/session for ${user.email} -> ${response.status()}`,
    ).toBeTruthy();
    sessionId = ((await response.json()) as { id: string }).id;
  } finally {
    await throwaway.dispose();
  }

  const { hostname } = new URL(baseUrl);
  const cookie = { domain: hostname, path: "/" };
  await context.addCookies([
    { name: "metabase.SESSION", value: sessionId, httpOnly: true, ...cookie },
    { name: "metabase.TIMEOUT", value: "alive", ...cookie },
    {
      name: "metabase.DEVICE",
      value: "my-device-id",
      httpOnly: true,
      ...cookie,
    },
  ]);

  return new MetabaseApi(api.requestContext, () => sessionId);
}

/**
 * ADDED BY THE PORT (not upstream), and deliberately so: this is the assertion
 * that stops a sandboxing test from going green while the API calls it
 * measures were actually made by an admin. Cypress gets this for free from its
 * single cookie jar; the Playwright harness does not, and the failure mode is
 * silent for `assertNoResultsOrValuesAreSandboxed`.
 */
export async function assertRunningAs(api: MetabaseApi, email: string) {
  const response = await api.get("/api/user/current");
  const body = (await response.json()) as { email: string };
  expect(body.email, `API calls should be running as ${email}`).toBe(email);
}

export async function assignAttributeToUser(
  api: MetabaseApi,
  {
    user,
    attributeKey = "filter-attribute",
    attributeValue,
  }: { user: NormalUser; attributeKey?: string; attributeValue: string },
) {
  const list = (await (await api.get("/api/user")).json()) as {
    data: { id: number; email: string }[];
  };
  const found = list.data.find((candidate) => candidate.email === user.email);
  expect(found, `user ${user.email} exists`).toBeTruthy();
  const full = await (await api.get(`/api/user/${found!.id}`)).json();
  await api.put(`/api/user/${full.id}`, {
    ...full,
    login_attributes: { [attributeKey]: attributeValue },
  });
}

// ── setup (e2e-sandboxing-helpers.ts:173-268) ──────────────────────────────

export async function preparePermissions(api: MetabaseApi) {
  await blockUserGroupPermissions(api, ALL_USERS_GROUP);
  await blockUserGroupPermissions(api, COLLECTION_GROUP);
  await blockUserGroupPermissions(api, READONLY_GROUP);
}

/** Port of addCustomColumnToQuestion. */
async function addCustomColumnToQuestion(
  page: Page,
  customColumnType: CustomColumnType,
) {
  await icon(getNotebookStep(page, "expression"), "add").click();
  await enterCustomColumnDetails(page, {
    formula: customColumnTypeToFormula[customColumnType],
    name: `my_${customColumnType}`,
  });
  await popover(page)
    .getByRole("button", { name: "Done", exact: true })
    .click();
}

/** Port of addCustomColumnsToQuestion. */
async function addCustomColumnsToQuestion(page: Page) {
  await openNotebook(page);
  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Custom column", exact: true })
    .click();
  for (const type of customColumnTypes) {
    await addCustomColumnToQuestion(page, type);
  }
  await visualize(page);

  const updateQuestion = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await modal(page).getByRole("button", { name: "Save", exact: true }).click();
  await updateQuestion;
}

export type CollectionItem = { id: number; name: string; model?: string };

/**
 * Port of createSandboxingDashboardAndQuestions: creates all questions and
 * models, puts them in one dashboard, and returns the Sandboxing collection's
 * items (which is what upstream classifies into dashboard / questions /
 * custom views).
 */
export async function createSandboxingDashboardAndQuestions(
  api: MetabaseApi,
  page: Page,
): Promise<CollectionItem[]> {
  // NOTE (faithful to upstream): the two custom views are created BEFORE the
  // Sandboxing collection and with no collection_id, so they land in "Our
  // analytics" (root) — not in the Sandboxing collection. That is why they
  // never show up in the collection items below, and why `customViews` is
  // empty in the spec. The entity picker in configureSandboxPolicy still finds
  // them because its `contains(name)` is scoped to the whole modal.
  for (const view of customViewDefinitions) {
    await createQuestion(api, view);
  }

  const { id: collectionId } = await createCollection(api, {
    name: "Sandboxing",
  });

  const { dashboard, questions } = await createDashboardWithQuestions(api, {
    dashboardName: "Dashboard with sandboxable questions",
    dashboardDetails: { collection_id: collectionId },
    questions: questionData.map((questionDetails) => ({
      ...questionDetails,
      collection_id: collectionId,
    })),
  });

  const savedQuestionId = questions.find(
    (question) => question.name === savedQuestion.name,
  )?.id;
  await createQuestionAndAddToDashboard(
    api,
    {
      name: "Question based on the all-products question",
      query: { ...baseQuery, "source-table": `card__${savedQuestionId}` },
      collection_id: collectionId,
    },
    dashboard.id,
  );

  const modelId = questions.find((question) => question.name === model.name)?.id;
  await createQuestionAndAddToDashboard(
    api,
    {
      name: "Question based on model",
      query: { ...baseQuery, "source-table": `card__${modelId}` },
      collection_id: collectionId,
    },
    dashboard.id,
  );

  const customColumnCard = await createQuestionAndAddToDashboard(
    api,
    {
      name: "Question with custom columns",
      query: baseQuery,
      collection_id: collectionId,
    },
    dashboard.id,
  );

  await visitQuestion(page, customColumnCard.card_id);
  await addCustomColumnsToQuestion(page);

  // copy custom column question to a model
  const cardBody = await (
    await api.get(`/api/card/${customColumnCard.card_id}`)
  ).json();
  const modelWithCustomColumns = (await (
    await api.post("/api/card", {
      ...cardBody,
      name: "Model with custom columns",
      type: "model",
    })
  ).json()) as { id: number };
  await addQuestionToDashboard(api, {
    cardId: modelWithCustomColumns.id,
    dashboardId: dashboard.id,
  });

  const items = (await (
    await api.get(`/api/collection/${collectionId}/items`)
  ).json()) as { data: CollectionItem[] };
  return items.data;
}

/** Port of H.createQuestionAndAddToDashboard (returns the new dashcard). */
async function createQuestionAndAddToDashboard(
  api: MetabaseApi,
  details: StructuredQuestionDetails,
  dashboardId: number,
): Promise<{ id: number; card_id: number }> {
  const { id: cardId } = await createQuestion(api, details);
  return addQuestionToDashboard(api, { cardId, dashboardId });
}

/** Port of H.addQuestionToDashboard. */
async function addQuestionToDashboard(
  api: MetabaseApi,
  { cardId, dashboardId }: { cardId: number; dashboardId: number },
): Promise<{ id: number; card_id: number }> {
  const current = (await (
    await api.get(`/api/dashboard/${dashboardId}`)
  ).json()) as { dashcards: Record<string, unknown>[] };
  const response = await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      ...current.dashcards,
      { id: -1, card_id: cardId, row: 0, col: 0, size_x: 11, size_y: 8 },
    ],
  });
  const body = (await response.json()) as {
    dashcards: { id: number; card_id: number }[];
  };
  return body.dashcards[body.dashcards.length - 1];
}

// ── the sandbox policy UI (e2e-sandboxing-helpers.ts:337-418) ──────────────

export async function configureSandboxPolicy(
  page: Page,
  policy: SandboxPolicy,
  { databaseId = 1, tableName = "Products" } = {},
) {
  const { filterTableBy, customViewName, filterColumn } = policy;

  await page.goto(`/admin/permissions/data/database/${databaseId}`);
  // findByRole(role, { name: <string> }) is an EXACT match in testing-library.
  await page.getByRole("menuitem", { name: tableName, exact: true }).click();
  await modifyPermission(page, "data", 0, "Row and column security");

  const changeModal = modal(page);
  // Upstream's bare findByText is an implicit existence assertion.
  await expect(
    changeModal.getByText(
      /Change access to this database to .*Row and column security.*?/,
    ),
  ).toHaveCount(1);
  await changeModal
    .getByRole("button", { name: "Change", exact: true })
    .click();

  await expect(
    modal(page).getByText(/Configure row and column security for this table/),
  ).toHaveCount(1);

  if (filterTableBy !== "custom_view") {
    await expect(
      page.getByRole("radio", { name: /Filter by a column in the table/ }),
    ).toBeChecked();
  } else if (customViewName) {
    // activity/recents invalidates the card cache, causing the component to
    // refetch and show the loading spinner, which makes this flaky — upstream
    // returns a 500 to prevent the invalidation. Body is specified upstream,
    // so it is reproduced (an omitted cy.intercept body would be EMPTY).
    await page.route("**/api/activity/recents", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Stubbed to prevent flaky test" }),
          })
        : route.fallback(),
    );

    // cy.wait(["@getCollectionItems", "@getCollectionItems"]) — a Cypress
    // queue that pops responses seen since the intercept was registered, so
    // collect from here rather than registering two waits after the fact.
    const collectionItems: Response[] = [];
    const collect = (response: Response) => {
      if (/^\/api\/collection\/[^/]+\/items/.test(new URL(response.url()).pathname)) {
        collectionItems.push(response);
      }
    };
    page.on("response", collect);

    try {
      await page
        .getByText(/Use a saved question to create a custom view for this table/)
        .click();
      await page.getByTestId("custom-view-picker-button").click();

      await expect
        .poll(() => collectionItems.length, {
          message: "two /api/collection/*/items responses",
          timeout: 30_000,
        })
        .toBeGreaterThanOrEqual(2);
    } finally {
      page.off("response", collect);
    }

    const picker = entityPickerModal(page);
    await picker.getByText(/Our analytics/).click();
    await picker.getByText(/Sandboxing/).click();
    // cy.contains(str) is a case-sensitive substring match, scoped to the
    // whole modal (NOT to the last picker column) — upstream relies on that,
    // because the custom views live in the root collection, not Sandboxing.
    await picker
      .getByText(new RegExp(escapeRegExp(customViewName)))
      .first()
      .click();
    await picker.getByText("Select", { exact: true }).click();
  }

  if (filterColumn) {
    await modal(page)
      .getByRole("button", { name: /Pick a column|parameter/ })
      .click();
    await page
      .getByRole("option", { name: filterColumn, exact: true })
      .click();
    await modal(page).getByPlaceholder(/Pick a user attribute/).click();
    await page
      .getByRole("option", { name: "filter-attribute", exact: true })
      .click();
  }

  // "Wait for the whole summary to render"
  const summary = page.getByLabel(/Summary/);
  await expect(summary).toContainText("data");

  const summaryText = await summary.innerText();
  expect(summaryText).toContain("Users in data can view");
  if (filterColumn) {
    expect(summaryText).toContain(`${filterColumn} field equals`);
  }

  await modal(page).getByRole("button", { name: "Save", exact: true }).click();

  await saveChangesToPermissions(page);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── result collection ─────────────────────────────────────────────────────

export type DatasetBody = {
  data: { rows: unknown[][]; is_sandboxed?: boolean };
  json_query?: { query?: unknown };
};

export type CapturedResponse = { url: string; body: DatasetBody };

const getQuestionDescription = (
  response: CapturedResponse,
  questions: CollectionItem[],
) => {
  const cardId = Number(response.url.match(/\/card\/(\d+)/)?.[1]);
  const questionName = questions.find(
    (question) => question.id === cardId,
  )?.name;
  const query = JSON.stringify(response.body.json_query?.query);
  return { questionDesc: `${questionName} (query: ${query})`, questionName };
};

const isDashcardQuery = (response: Response) =>
  response.request().method() === "POST" &&
  /\/dashcard\/\d+\/card\/\d+\/query$/.test(new URL(response.url()).pathname);

/**
 * Port of getDashcardResponses: visit the dashboard and take the first
 * `questions.length` dashcard-query responses — upstream's
 * `cy.wait(new Array(questions.length).fill("@dashcardQuery"))`.
 */
export async function getDashcardResponses(
  page: Page,
  dashboardId: number,
  questions: CollectionItem[],
): Promise<CapturedResponse[]> {
  expect(questions.length).toBeGreaterThan(0);

  const seen: Response[] = [];
  const collect = (response: Response) => {
    if (isDashcardQuery(response)) {
      seen.push(response);
    }
  };
  page.on("response", collect);
  try {
    await page.goto(`/dashboard/${dashboardId}`);
    await expect
      .poll(() => seen.length, {
        message: `${questions.length} dashcard query responses`,
        timeout: 60_000,
      })
      .toBeGreaterThanOrEqual(questions.length);
  } finally {
    page.off("response", collect);
  }

  return Promise.all(
    seen.slice(0, questions.length).map(async (response) => ({
      url: response.url(),
      body: (await response.json()) as DatasetBody,
    })),
  );
}

/** Port of getCardResponses — MUST run as the sandboxed user. */
export async function getCardResponses(
  api: MetabaseApi,
  questions: CollectionItem[],
): Promise<CapturedResponse[]> {
  expect(questions.length).toBeGreaterThan(0);
  return Promise.all(
    questions.map(async (question) => {
      const response = await api.post(
        `/api/card/${question.id}/query`,
        undefined,
        { failOnStatusCode: false },
      );
      return {
        url: response.url(),
        body: (await response.json()) as DatasetBody,
      };
    }),
  );
}

/** H.visitQuestionAdhoc(adhocQuestionData) with the /api/dataset response kept. */
export async function visitAdhocQuestionCapturingDataset(
  page: Page,
): Promise<CapturedResponse> {
  const metadata = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dataset/query_metadata",
  );
  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await page.goto(`/question#${adhocQuestionHash(adhocQuestionData as never)}`);
  await metadata;
  const response = await dataset;
  return { url: response.url(), body: (await response.json()) as DatasetBody };
}

export async function getFieldValuesForProductCategories(api: MetabaseApi) {
  const response = await api.get(`/api/field/${PRODUCTS.CATEGORY}/values`);
  return (await response.json()) as { values: unknown[][] };
}

export async function getParameterValuesForProductCategories(
  api: MetabaseApi,
) {
  const response = await api.post("/api/dataset/parameter/values", {
    parameter: {
      id: "1234",
      name: "Text",
      slug: "text",
      type: "string/=",
      values_query_type: "list",
      values_source_type: null,
      values_source_config: {},
    },
    field_ids: [PRODUCTS.CATEGORY],
  });
  return (await response.json()) as { values: unknown[][] };
}

// ── assertions ────────────────────────────────────────────────────────────

const productCategories = ["Gizmo", "Widget", "Doohickey", "Gadget"] as const;
export type ProductCategory = (typeof productCategories)[number];

const rowIncludes = (row: unknown[], value: string) =>
  row.some((cell) => cell === value);

export function rowsShouldContainGizmosAndWidgets({
  responses,
  questions,
}: {
  responses: CapturedResponse[];
  questions: CollectionItem[];
}) {
  expect(responses.length).toBe(questions.length);
  for (const response of responses) {
    const { questionDesc } = getQuestionDescription(response, questions);
    expect(
      JSON.stringify(response.body),
      `No error in ${questionDesc}`,
    ).not.toContain("stacktrace");
    expect(
      response.body.data.is_sandboxed,
      `Results are not sandboxed in ${questionDesc}`,
    ).toBe(false);
    const rows = response.body.data.rows;
    expect(
      rows.some((row) => rowIncludes(row, "Gizmo")),
      `Results include at least one Gizmo in ${questionDesc}`,
    ).toBe(true);
    expect(
      rows.some(
        (row) =>
          rowIncludes(row, "Widget") ||
          rowIncludes(row, "Gadget") ||
          rowIncludes(row, "Doohickey"),
      ),
      `Results include at least one Widget, Gadget, or Doohickey in ${questionDesc}`,
    ).toBe(true);
  }
}

export function rowsShouldContainOnlyOneCategory({
  responses,
  questions,
  productCategory,
}: {
  responses: CapturedResponse[];
  questions: CollectionItem[];
  productCategory: ProductCategory;
}) {
  expect(responses.length, "Correct number of responses").toBe(
    questions.length,
  );

  for (const response of responses) {
    const { questionDesc } = getQuestionDescription(response, questions);
    expect(
      response.body.data.is_sandboxed,
      `Response is sandboxed for: ${questionDesc}`,
    ).toBe(true);

    const rows = response.body.data.rows;
    expect(
      rows.every(
        (row) =>
          rowIncludes(row, productCategory) ||
          // With implicit joins, some rows might have a null product
          row[0] === null,
      ),
      `Every result should have have a ${productCategory} in: ${questionDesc}`,
    ).toBe(true);

    for (const otherCategory of productCategories.filter(
      (category) => category !== productCategory,
    )) {
      expect(
        !rows.some((row) => rowIncludes(row, otherCategory)),
        `No results should have ${otherCategory}s in: ${questionDesc}`,
      ).toBe(true);
    }
  }
}

export function valuesShouldContainGizmosAndWidgets(valuesArray: unknown[][]) {
  const values = valuesArray.map((value) => value[0]);
  expect(values).toContain("Gizmo");
  expect(values).toContain("Widget");
}

export function valuesShouldContainOnlyOneCategory(
  valuesArray: unknown[][],
  productCategory: ProductCategory,
) {
  const values = valuesArray.map((value) => value[0]);
  expect(values).toEqual([productCategory]);
}

/** The ad-hoc question stands in for a "question" in the description helper —
 * upstream casts `adhocQuestionData` into the questions array for exactly one
 * purpose (the length check and the description string). */
const adhocAsQuestion = adhocQuestionData as unknown as CollectionItem;

export async function assertNoResultsOrValuesAreSandboxed(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
  questions: CollectionItem[],
) {
  rowsShouldContainGizmosAndWidgets({
    responses: await getDashcardResponses(page, dashboardId, questions),
    questions,
  });
  rowsShouldContainGizmosAndWidgets({
    responses: await getCardResponses(api, questions),
    questions,
  });
  rowsShouldContainGizmosAndWidgets({
    responses: [await visitAdhocQuestionCapturingDataset(page)],
    questions: [adhocAsQuestion],
  });
  valuesShouldContainGizmosAndWidgets(
    (await getFieldValuesForProductCategories(api)).values,
  );
  valuesShouldContainGizmosAndWidgets(
    (await getParameterValuesForProductCategories(api)).values,
  );
}

export async function assertAllResultsAndValuesAreSandboxed(
  page: Page,
  api: MetabaseApi,
  dashboardId: number,
  questions: CollectionItem[],
  productCategory: ProductCategory,
) {
  rowsShouldContainOnlyOneCategory({
    responses: await getDashcardResponses(page, dashboardId, questions),
    questions,
    productCategory,
  });
  rowsShouldContainOnlyOneCategory({
    responses: await getCardResponses(api, questions),
    questions,
    productCategory,
  });
  rowsShouldContainOnlyOneCategory({
    responses: [await visitAdhocQuestionCapturingDataset(page)],
    questions: [adhocAsQuestion],
    productCategory,
  });
  valuesShouldContainOnlyOneCategory(
    (await getFieldValuesForProductCategories(api)).values,
    productCategory,
  );
  valuesShouldContainOnlyOneCategory(
    (await getParameterValuesForProductCategories(api)).values,
    productCategory,
  );
}
