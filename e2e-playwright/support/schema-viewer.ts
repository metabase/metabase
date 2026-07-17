/**
 * Helpers for the schema-viewer spec (port of the Cypress helpers used by
 * e2e/test/scenarios/schema-viewer/schema-viewer.cy.spec.ts).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";

/** Mirrors e2e/support/cypress_data.js */
export const WRITABLE_DB_ID = 2;

/** Mirrors MAGIC_USER_GROUPS in e2e/support/cypress_data.js */
export const MAGIC_USER_GROUPS = {
  EXTERNAL_USERS_GROUP: 3,
  DATA_ANALYSTS_GROUP: 4,
};

// Writable-postgres connection facts from e2e/support/cypress_data.js
// (QA_DB_CREDENTIALS / QA_POSTGRES_PORT / WRITABLE_DB_CONFIG.postgres).
const WRITABLE_PG_CONFIG = {
  host: "localhost",
  user: "metabase",
  password: "metasample123",
  database: "writable_db",
  port: 5404,
  ssl: false,
};

export function tableNode(page: Page, tableId: number): Locator {
  return page.locator(`[data-id="table-${tableId}"]`);
}

export function schemaPickerTrigger(page: Page): Locator {
  return page.getByTestId("schema-picker-button");
}

export function schemaViewerSearchInput(page: Page): Locator {
  return page.getByTestId("schema-viewer-node-search-input");
}

export function infoPanel(page: Page): Locator {
  return page.getByTestId("graph-info-panel");
}

export function reactFlowViewport(page: Page): Locator {
  return page.locator(".react-flow__viewport");
}

/** Port of H.DataStudio.nav() (e2e-data-studio-helpers.ts). */
export function dataStudioNav(page: Page): Locator {
  return page.getByTestId("data-studio-nav");
}

/**
 * Port of H.DataModel.TableSection.getActionsMenuButton()
 * (e2e-datamodel-helpers.ts).
 */
export function tableSectionActionsMenuButton(page: Page): Locator {
  return page
    .getByTestId("table-section")
    .getByRole("button", { name: "More actions", exact: true });
}

/** Port of H.menu() (e2e-ui-elements-helpers.js). */
export function menu(page: Page): Locator {
  return page.getByRole("menu");
}

/**
 * Register BEFORE the action that triggers the ERD fetch; await after
 * (replaces cy.intercept("GET", "/api/ee/erd*").as("erd") + cy.wait).
 */
export function waitForErd(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/ee/erd",
  );
}

/**
 * Port of assertViewportZoom for the two "at least" call sites. Retries via
 * expect.poll (the camera animates), like the Cypress .should callback did.
 */
export async function expectViewportZoomAtLeast(
  page: Page,
  minZoom: number,
  message: string,
) {
  await expect
    .poll(async () => {
      const style = (await reactFlowViewport(page).getAttribute("style")) ?? "";
      const match = /scale\(([\d.]+)\)/.exec(style);
      // NaN fails the comparison, so the poll keeps retrying until the
      // viewport transform contains a scale(...).
      return match ? parseFloat(match[1]) : NaN;
    }, { message })
    .toBeGreaterThanOrEqual(minZoom);
}

/** Port of assertNodeInViewport — bounding-rect overlap, retried. */
export async function expectNodeInViewport(page: Page, tableId: number) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const reactFlow = document.querySelector(".react-flow");
          const node = document.querySelector(`[data-id="table-${id}"]`);
          if (!reactFlow || !node) {
            return false;
          }
          const viewportRect = reactFlow.getBoundingClientRect();
          const tableNodeRect = node.getBoundingClientRect();
          return (
            tableNodeRect.right > viewportRect.left &&
            tableNodeRect.left < viewportRect.right &&
            tableNodeRect.bottom > viewportRect.top &&
            tableNodeRect.top < viewportRect.bottom
          );
        }, tableId),
      {
        message: `table-${tableId} bounding rect should overlap the React Flow viewport`,
      },
    )
    .toBe(true);
}

type PgClient = {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
};

/**
 * Port of H.queryWritableDB(sql, "postgres") — the Cypress version runs
 * through cy.task("connectAndQueryDB") + knex; here we talk to the writable
 * postgres container directly. `pg` is not a dependency of this package; it
 * resolves from the repo root node_modules (the same driver the Cypress db
 * tasks use), which is why this only runs behind the QA_DB_ENABLED gate.
 */
export async function queryWritableDB(query: string): Promise<void> {
  const { Client } = require("pg") as {
    Client: new (config: Record<string, unknown>) => PgClient;
  };
  const client = new Client(WRITABLE_PG_CONFIG);
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

/** Port of H.getTableId (e2e-qa-databases-helpers.js). */
export async function getTableId(
  api: MetabaseApi,
  {
    databaseId = WRITABLE_DB_ID,
    name,
    schema,
  }: { databaseId?: number; name: string; schema?: string },
): Promise<number> {
  const response = await api.get("/api/table");
  const tables = (await response.json()) as {
    id: number;
    db_id: number;
    name: string;
    schema: string;
  }[];
  const table = tables.find(
    (table) =>
      table.db_id === databaseId &&
      table.name === name &&
      (schema ? table.schema === schema : true),
  );
  if (!table) {
    throw new TypeError(`Table with name ${name} cannot be found`);
  }
  return table.id;
}

/**
 * Port of H.resyncDatabase + waitForSyncToFinish
 * (e2e-qa-databases-helpers.js), including the occasional sync_schema
 * retrigger for the silently-dropped-sync case (QUE2-663).
 */
export async function resyncDatabase(
  api: MetabaseApi,
  {
    dbId = WRITABLE_DB_ID,
    tables = [],
    retrigger = false,
  }: { dbId?: number; tables?: string[]; retrigger?: boolean },
) {
  const SYNC_RETRY_DELAY_MS = 500;
  const RESYNC_TRIGGER_INDEX = 10;

  await api.post(`/api/database/${dbId}/sync_schema`);
  await api.post(`/api/database/${dbId}/rescan_values`);

  const deadline = Date.now() + 3 * 60_000;
  for (let iteration = 0; Date.now() < deadline; iteration++) {
    if (retrigger && iteration > 0 && iteration % RESYNC_TRIGGER_INDEX === 0) {
      await api.post(`/api/database/${dbId}/sync_schema`);
    }
    await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_DELAY_MS));
    const response = await api.get(`/api/database/${dbId}/metadata`);
    const body = (await response.json()) as {
      tables: { name: string; initial_sync_status: string }[];
    };
    if (body.tables.length) {
      const completed = new Set(
        body.tables
          .filter((table) => table.initial_sync_status === "complete")
          .map((table) => table.name),
      );
      if (tables.every((name) => completed.has(name))) {
        return;
      }
    }
  }
  throw new Error(
    `Timed out waiting for tables [${tables.join(", ")}] to finish syncing on database ${dbId}`,
  );
}
