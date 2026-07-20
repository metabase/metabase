/**
 * Helpers for the object-detail spec port
 * (e2e/test/scenarios/visualizations-tabular/object_detail.cy.spec.js).
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9).
 *
 * The writable-DB half (resetTestTable) talks to the writable QA postgres /
 * mysql containers, so it only runs behind the PW_QA_DB_ENABLED gate — those
 * describes are `@external` upstream. `knex`/`pg`/`mysql2` are not
 * dependencies of this package; they resolve from the repo-root node_modules
 * (the same drivers Cypress uses), which is why the require is lazy: the
 * module must still load when the gate is off and the drivers may be absent.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { popover } from "./ui";

export const QA_DB_SKIP =
  "@external — requires the writable QA postgres/mysql containers and their " +
  "postgres-writable / mysql-writable snapshots (set PW_QA_DB_ENABLED)";

export type WritableDialect = "postgres" | "mysql";

// Writable-DB connection facts from e2e/support/cypress_data.js
// (WRITABLE_DB_CONFIG). Postgres connects as `metabase`; mysql needs `root`.
const WRITABLE_DB_CONFIG: Record<
  WritableDialect,
  { client: string; connection: Record<string, unknown> }
> = {
  postgres: {
    client: "pg",
    connection: {
      host: "localhost",
      user: "metabase",
      password: "metasample123",
      database: "writable_db",
      port: 5404,
      ssl: false,
    },
  },
  mysql: {
    client: "mysql2",
    connection: {
      host: "localhost",
      user: "root",
      password: "metasample123",
      database: "writable_db",
      port: 3304,
      multipleStatements: true,
    },
  },
};

type KnexClient = {
  raw(sql: string): Promise<unknown>;
  schema: {
    dropTableIfExists(name: string): Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTable(name: string, cb: (table: any) => void): Promise<unknown>;
  };
  (tableName: string): {
    insert(rows: Record<string, unknown>[]): Promise<unknown>;
  };
  destroy(): Promise<void>;
};

function knexClient(dialect: WritableDialect): KnexClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  return Knex(WRITABLE_DB_CONFIG[dialect]);
}

export const COMPOSITE_PK_TABLE = "composite_pk_table";
export const NO_PK_TABLE = "no_pk_table";

/**
 * Port of H.resetTestTable({ type, table }) (cy.task("resetTable") →
 * e2e/support/test_tables.js) for the two tables this spec uses. The knex
 * schema-builder calls and the row data are transcribed verbatim from
 * `composite_pk_table` / `no_pk_table` in e2e/support/test_tables.js.
 */
export async function resetTestTable({
  type,
  table,
}: {
  type: WritableDialect;
  table: typeof COMPOSITE_PK_TABLE | typeof NO_PK_TABLE;
}) {
  const client = knexClient(type);
  try {
    await client.schema.dropTableIfExists(table);
    if (table === COMPOSITE_PK_TABLE) {
      await client.schema.createTable(table, (t) => {
        t.integer("id1");
        t.string("id2");
        t.string("name");
        t.integer("score");
        t.primary(["id1", "id2"]);
      });
      await client(table).insert([
        { id1: 1, id2: "alpha", name: "Duck", score: 10 },
        { id1: 1, id2: "beta", name: "Horse", score: 20 },
        { id1: 2, id2: "alpha", name: "Cow", score: 30 },
        { id1: 2, id2: "beta", name: "Pig", score: 40 },
        { id1: 3, id2: "alpha", name: "Chicken", score: 50 },
        { id1: 3, id2: "beta", name: "Rabbit", score: 60 },
      ]);
    } else {
      await client.schema.createTable(table, (t) => {
        t.string("name");
        t.integer("score");
      });
      await client(table).insert([
        { name: "Duck", score: 10 },
        { name: "Horse", score: 20 },
        { name: "Cow", score: 30 },
        { name: "Pig", score: 40 },
        { name: "Chicken", score: 50 },
        { name: "Rabbit", score: 60 },
      ]);
    }
  } finally {
    await client.destroy();
  }
}

/**
 * Diagnostic used to record what the shared writable container actually holds
 * (PORTING #85 — five slots share `writable_db` and it carries debris tables
 * across foreign schemas). Not called by the spec.
 */
export async function listWritableTables(
  dialect: WritableDialect,
): Promise<unknown> {
  const client = knexClient(dialect);
  try {
    const sql =
      dialect === "postgres"
        ? "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1,2"
        : "select table_schema, table_name from information_schema.tables where table_schema = 'writable_db' order by 2";
    const result = await client.raw(sql);
    return dialect === "mysql"
      ? (result as [unknown, unknown])[0]
      : (result as { rows: unknown }).rows;
  } finally {
    await client.destroy();
  }
}

// === spec-local Cypress helpers ===

/**
 * Port of the spec-local `getRow(rowIndex)` — `cy.get('[data-index=N]')`.
 *
 * Two notes:
 * - `[data-index=0]` is invalid CSS (Sizzle accepts it, `querySelectorAll`
 *   throws), so the value is quoted.
 * - TableInteractive renders each data row once per horizontal quadrant
 *   (frozen + centre), so this matches two `role="row"` nodes per index, just
 *   as it does in Cypress. Callers that need a single element say so.
 */
export function getRow(page: Page, rowIndex: number): Locator {
  return page.locator(`[data-index="${rowIndex}"]`);
}

/** The frozen-quadrant copy of a row — the one carrying `detail-shortcut`. */
export function getShortcutRow(page: Page, rowIndex: number): Locator {
  return getRow(page, rowIndex)
    .filter({ has: page.getByTestId("detail-shortcut") })
    .first();
}

/**
 * Port of the spec-local `getObjectDetailShortcut(rowIndex)`:
 * `getRow(i).realHover({scrollBehavior:false}).findByTestId("detail-shortcut")
 *  .should("be.visible")`.
 */
export async function getObjectDetailShortcut(
  page: Page,
  rowIndex: number,
): Promise<Locator> {
  const row = getShortcutRow(page, rowIndex);
  await row.hover();
  const shortcut = row.getByTestId("detail-shortcut");
  await expect(shortcut).toBeVisible();
  return shortcut;
}

/**
 * Port of the spec-local `drillPK({ id })`:
 * `cy.get(".test-Table-ID").contains(id).first().click()`.
 *
 * `cy.contains` is a case-sensitive SUBSTRING match returning the first hit in
 * document order — `filter({ hasText })` + `.first()` is the same thing (digits
 * make the case-insensitivity of `hasText` irrelevant).
 */
export async function drillPK(page: Page, { id }: { id: number | string }) {
  await page
    .locator(".test-Table-ID")
    .filter({ hasText: String(id) })
    .first()
    .click();
}

/** Port of the spec-local `drillFK({ id })`. */
export async function drillFK(page: Page, { id }: { id: number | string }) {
  await page
    .locator(".test-Table-FK")
    .filter({ hasText: String(id) })
    .first()
    .click();
  await popover(page).getByText("View details", { exact: true }).click();
}

/**
 * Port of the spec-local `assertDetailView({ id, heading, subtitle, byFK })`.
 *
 * The URL regex is transcribed VERBATIM, including upstream's `[1-9]d*` (a
 * literal `d`, not `\d`) — the pattern still matches because the following
 * `.*` absorbs the rest of the slug, so the typo is harmless rather than
 * vacuous. `cy.url().should("match")` retries → `expect.poll`.
 */
export async function assertDetailView(
  page: Page,
  {
    id,
    heading,
    subtitle,
    byFK = false,
  }: {
    id: number | string;
    heading?: string;
    subtitle?: string;
    byFK?: boolean;
  },
) {
  if (heading) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  if (subtitle) {
    await expect(
      page.getByRole("heading", { name: subtitle, exact: true }),
    ).toBeVisible();
  }
  const pattern = byFK
    ? new RegExp("/question#*")
    : new RegExp(`/question/[1-9]d*.*/${id}`);
  await expect.poll(() => page.url()).toMatch(pattern);
}

export function assertOrderDetailView(
  page: Page,
  args: { id: number | string; heading?: string; subtitle?: string },
) {
  return assertDetailView(page, args);
}

export function assertUserDetailView(
  page: Page,
  args: { id: number | string; heading?: string; subtitle?: string },
) {
  return assertDetailView(page, { ...args, byFK: true });
}

/** Port of the spec-local getPreviousObjectDetailButton. */
export function getPreviousObjectDetailButton(page: Page): Locator {
  return page.getByLabel("Previous row", { exact: true });
}

/** Port of the spec-local getNextObjectDetailButton. */
export function getNextObjectDetailButton(page: Page): Locator {
  return page.getByLabel("Next row", { exact: true });
}

/** `cy.findByTestId("object-detail")`. */
export function objectDetail(page: Page): Locator {
  return page.getByTestId("object-detail");
}

/** Register BEFORE the triggering action; await after (rule 2). */
export function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}
