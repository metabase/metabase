/**
 * Helpers for the documents spec port. Ports of:
 * - e2e/support/helpers/e2e-document-helpers.ts (documentContent,
 *   addToDocument, getDocumentCard, the suggestion dialogs, drag helpers, …)
 * - e2e/support/helpers/api/createDocument.ts
 * - e2e/support/helpers/e2e-qa-databases-helpers.js (addPostgresDatabase)
 * - the card fixtures the spec uses from e2e/support/test-visualization-data
 *   (that module resolves imports through the Cypress "e2e/*" path alias, so
 *   it can't be imported from this project — the handful of cards the
 *   documents spec embeds are inlined here)
 * - H.removeSummaryGroupingField (e2e-notebook-helpers.ts)
 *
 * ProseMirror notes: like CodeMirror, the editor needs real keystrokes.
 * addToDocument types through page.keyboard with the same 10ms inter-key
 * delay as cy.realType, which keeps the markdown input rules and the "/"
 * command dialog happy.
 */
import type { Locator, Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { getNotebookStep } from "./notebook";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, ACCOUNTS, ACCOUNTS_ID } =
  SAMPLE_DATABASE;

// === ids from cypress_sample_instance_data (same lookup as sample-data.ts) ===

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (collection) => collection.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

export const READ_ONLY_PERSONAL_COLLECTION_ID = findCollectionId(
  "Read Only Tableton's Personal Collection",
);

export const NO_SQL_PERSONAL_COLLECTION_ID = findCollectionId(
  "No SQL Tableton's Personal Collection",
);

// === card fixtures (e2e/support/test-visualization-data.ts) ===

export type CardDetails = {
  name: string;
  display?: string;
  query?: Record<string, unknown>;
  native?: { query: string; "template-tags"?: Record<string, unknown> };
  visualization_settings?: Record<string, unknown>;
  database?: number;
  collection_id?: number | null;
  dashboard_id?: number;
};

export const ORDERS_COUNT_BY_PRODUCT_CATEGORY: CardDetails = {
  display: "bar",
  name: "Orders by Product Category",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

export const ACCOUNTS_COUNT_BY_CREATED_AT: CardDetails = {
  display: "bar",
  name: "Accounts by Created At (Month)",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [["field", ACCOUNTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_COUNT_BY_CATEGORY: CardDetails = {
  display: "bar",
  name: "Products by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_AVERAGE_BY_CATEGORY: CardDetails = {
  display: "bar",
  name: "Products average by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["avg"],
  },
};

export const PRODUCTS_COUNT_BY_CATEGORY_PIE: CardDetails = {
  ...PRODUCTS_COUNT_BY_CATEGORY,
  display: "pie",
  name: "Products by Category (Pie)",
};

export const PIVOT_TABLE_CARD: CardDetails = {
  name: "Pivot table",
  display: "pivot",
  query: {
    aggregation: [["count"], ["avg", ["field", ORDERS.QUANTITY, null]]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
    "source-table": ORDERS_ID,
  },
};

export const STEP_COLUMN_CARD: CardDetails = {
  name: "Step Column",
  display: "table",
  native: {
    query: `
      SELECT 'Landing page' AS "Step"
      UNION
      SELECT 'Checkout page' AS "Step"
      UNION
      SELECT 'Payment done page' AS "Step"
    `,
  },
};

export const SCALAR_CARD: Record<string, CardDetails> = {
  LANDING_PAGE_VIEWS: {
    display: "scalar",
    name: "Landing Page",
    native: {
      query: 'SELECT 1000 as "views"',
    },
  },
};

/**
 * Port of H.createQuestion / H.createNativeQuestion for the shapes this spec
 * needs (visualization_settings + dashboard_id aren't accepted by the shared
 * api.createQuestion).
 */
export async function createCard(api: MetabaseApi, details: CardDetails) {
  const {
    name,
    display = "table",
    query,
    native,
    visualization_settings = {},
    database = SAMPLE_DB_ID,
    ...rest
  } = details;
  const dataset_query = native
    ? { type: "native", native, database }
    : { type: "query", query, database };
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings,
    dataset_query,
    ...rest,
  });
  return (await response.json()) as { id: number };
}

// === port of api/createDocument.ts ===

export type DocumentNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
  text?: string;
};

export type DocumentContent = {
  type: "doc";
  content: DocumentNode[];
};

export async function createDocument(
  api: MetabaseApi,
  {
    name,
    document,
    collection_id,
  }: {
    name: string;
    document: DocumentContent;
    collection_id?: number | null;
  },
) {
  const response = await api.post("/api/document", {
    name,
    document,
    collection_id,
  });
  return (await response.json()) as { id: number; document: DocumentContent };
}

/**
 * Port of H.visitDocument: navigate and wait for the document fetch (any
 * status — the no-access/not-found tests ride on 403/404 responses).
 */
export async function visitDocument(page: Page, id: number) {
  const documentGet = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/document/${id}`,
  );
  await page.goto(`/document/${id}`);
  await documentGet;
}

// === ports of e2e-document-helpers.ts ===

export function documentContent(page: Page): Locator {
  return page.getByTestId("document-content");
}

export function documentSaveButton(page: Page): Locator {
  return page.getByRole("button", { name: "Save", exact: true });
}

export function documentFormattingMenu(page: Page): Locator {
  return page.getByTestId("document-formatting-menu");
}

/** Port of H.leaveConfirmationModal (e2e-ui-elements-helpers.js). */
export function leaveConfirmationModal(page: Page): Locator {
  return page.getByTestId("leave-confirmation");
}

/**
 * Port of H.addToDocument: cy.realType into the focused editor. "\n" presses
 * Enter, like realType.
 */
export async function addToDocument(page: Page, text: string, newLine = true) {
  await page.keyboard.type(text, { delay: 10 });
  if (newLine) {
    await page.keyboard.press("Enter");
  }
}

/** Port of H.clearDocumentContent: select-all + backspace in the editor. */
export async function clearDocumentContent(page: Page) {
  await documentContent(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
}

export function documentMentionDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Mention Dialog", exact: true });
}

export function commandSuggestionDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Command Dialog", exact: true });
}

export function documentMetabotDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Metabot dialog", exact: true });
}

/** Port of H.commandSuggestionItem (findByRole name strings are exact). */
export function commandSuggestionItem(
  page: Page,
  name: string | RegExp,
): Locator {
  return commandSuggestionDialog(page).getByRole("option", {
    name,
    exact: typeof name === "string",
  });
}

/** Port of H.documentMetabotSuggestionItem. */
export function documentMetabotSuggestionItem(
  page: Page,
  name: string | RegExp,
): Locator {
  return documentMetabotDialog(page).getByRole("option", {
    name,
    exact: typeof name === "string",
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of H.getDocumentCard: the embed whose title's innerText === name
 * (exact match, like the upstream `.filter(innerText === name)`).
 */
export function getDocumentCard(page: Page, name: string): Locator {
  return documentContent(page)
    .getByTestId("document-card-embed")
    .filter({
      has: page
        .getByTestId("card-embed-title")
        .filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) }),
    });
}

/** Port of H.getDocumentCardResizeContainer (`.closest('[data-type="resizeNode"]')`). */
export function getDocumentCardResizeContainer(
  page: Page,
  name: string,
): Locator {
  return getDocumentCard(page, name).locator(
    'xpath=ancestor::*[@data-type="resizeNode"][1]',
  );
}

/** Port of H.getFlexContainerForCard (`.closest('[data-type="flexContainer"]')`). */
export function getFlexContainerForCard(page: Page, name: string): Locator {
  return getDocumentCard(page, name).locator(
    'xpath=ancestor::*[@data-type="flexContainer"][1]',
  );
}

/** Port of H.getResizeHandlesForFlexContianer [sic]. */
export function getResizeHandlesForFlexContainer(container: Locator): Locator {
  return container.getByTestId("flex-container-drag-handle");
}

/** Port of H.getDragHandleForDocumentResizeNode. */
export function getDragHandleForDocumentResizeNode(container: Locator): Locator {
  return container.getByTestId("resize-node-drag-handle");
}

/** Port of H.assertDocumentCardVizType (upstream `.find()` = existence). */
export function documentCardVizType(
  page: Page,
  name: string,
  type: string,
): Locator {
  return getDocumentCard(page, name).locator(`[data-viz-ui-name="${type}"]`);
}

export function getDocumentSidebar(page: Page): Locator {
  return page.getByTestId("document-card-sidebar");
}

/** Port of H.openDocumentCardMenu. */
export async function openDocumentCardMenu(page: Page, name: string) {
  await getDocumentCard(page, name)
    .getByRole("button", { name: /ellipsis/ })
    .click();
}

/**
 * Port of H.documentDoDrag: press at the handle's top-left corner (like the
 * upstream clientX/clientY: rect.x/rect.y), drag by the given delta, release.
 */
export async function documentDoDrag(
  page: Page,
  handle: Locator,
  diff: { x?: number; y?: number },
) {
  const { x: deltaX = 0, y: deltaY = 0 } = diff;
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Drag handle is not visible");
  }
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + deltaX, box.y + deltaY, { steps: 5 });
  await page.mouse.up();
}

/**
 * Port of H.removeSummaryGroupingField: the close icon inside the breakout
 * cell for `field`.
 */
export async function removeSummaryGroupingField(
  page: Page,
  { field }: { field: string },
) {
  await getNotebookStep(page, "summarize")
    .getByTestId("breakout-step")
    .getByTestId("notebook-cell-item")
    .filter({ hasText: field })
    .locator(".Icon-close")
    .click();
}

// === port of H.addPostgresDatabase (e2e-qa-databases-helpers.js) ===

const QA_DB_CREDENTIALS = {
  host: "localhost",
  user: "metabase",
  password: "metasample123",
  database: "sample",
};
const QA_POSTGRES_PORT = 5404;

export async function addPostgresDatabase(
  api: MetabaseApi,
  displayName = "QA Postgres12",
) {
  const response = await api.post("/api/database", {
    engine: "postgres",
    name: displayName,
    details: {
      dbname: QA_DB_CREDENTIALS.database,
      host: QA_DB_CREDENTIALS.host,
      port: QA_POSTGRES_PORT,
      user: QA_DB_CREDENTIALS.user,
      password: QA_DB_CREDENTIALS.password,
      "additional-options": null,
      "tunnel-enabled": false,
    },
    auto_run_queries: true,
    is_full_sync: true,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  });
  return (await response.json()) as { id: number };
}

// === wait helpers ===

const isCardQueryResponse = (response: Response) =>
  response.request().method() === "POST" &&
  /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname);

/** Register a wait for the next POST /api/card/:id/query response. */
export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(isCardQueryResponse);
}

/**
 * Register a wait for `count` POST /api/card/:id/query responses (the flex
 * document loads 4 cards; Cypress looped cy.wait("@cardQuery")).
 */
export function waitForCardQueries(page: Page, count: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0;
    const handler = (response: Response) => {
      if (isCardQueryResponse(response)) {
        seen += 1;
        if (seen >= count) {
          page.off("response", handler);
          resolve();
        }
      }
    };
    page.on("response", handler);
  });
}

/**
 * jQuery-style .width(): content-box width. The upstream chart/container
 * width assertions compare $el.width() values.
 */
export function contentBoxWidth(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return (
      el.getBoundingClientRect().width -
      parseFloat(style.borderLeftWidth) -
      parseFloat(style.borderRightWidth) -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  });
}

/**
 * Cypress `should("not.be.visible")` on a scrolled-away block means "clipped
 * by the document's scroll container"; Playwright's toBeVisible ignores
 * clipping, so the anchor-scroll test asserts viewport intersection instead.
 */
export async function expectInViewport(
  page: Page,
  locator: Locator,
  expected: boolean,
) {
  await expect
    .poll(() =>
      locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      }),
    )
    .toBe(expected);
}
