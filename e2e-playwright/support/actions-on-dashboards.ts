/**
 * Helpers for the actions-on-dashboards spec port
 * (e2e/test/scenarios/actions/actions-on-dashboards.cy.spec.js).
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9).
 *
 * Everything here talks to the writable QA database (postgres or mysql), so it
 * only runs behind the PW_QA_DB_ENABLED gate — the whole upstream spec is
 * `@external`. The knex-backed DB helpers (queryWritableDB / resetTestTable)
 * mirror the Cypress db tasks (e2e/support/db_tasks.js +
 * e2e/support/helpers/e2e-qa-databases-helpers.js), which the Playwright
 * harness has no cy.task equivalent for. `knex`/`pg`/`mysql2` are not
 * dependencies of this package; they resolve from the repo-root node_modules
 * (the same drivers Cypress uses), which is why the require is lazy — the
 * module must still load when the gate is off and the drivers may be absent.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { WRITABLE_DB_ID, getTableId } from "./schema-viewer";
import { popover } from "./ui";
import { writableDbConfig } from "./writable-db";

export type WritebackDialect = "mysql" | "postgres";

// Connection facts live in support/writable-db.ts, which resolves this
// worker's own writable database (writable_db_w<slot>) when per-worker
// isolation is on.

type KnexClient = {
  raw(sql: string): Promise<unknown>;
  schema: {
    dropTableIfExists(name: string): Promise<unknown>;
    createTable(name: string, cb: (table: unknown) => void): Promise<unknown>;
  };
  (tableName: string): { insert(rows: Record<string, unknown>[]): Promise<unknown> };
  destroy(): Promise<void>;
};

function knexClient(dialect: WritebackDialect): KnexClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  return Knex(writableDbConfig(dialect));
}

/**
 * Port of H.queryWritableDB(sql, type) — the Cypress version runs through
 * cy.task("connectAndQueryDB"); here we talk to the writable container
 * directly with knex. Mirrors connectAndQueryDB's result normalisation:
 * mysql wraps its rows in `result[0]`, pg returns `{ rows }` already.
 */
export async function queryWritableDB(
  query: string,
  dialect: WritebackDialect,
): Promise<{ rows: Record<string, unknown>[] }> {
  const client = knexClient(dialect);
  try {
    const result = (await client.raw(query)) as
      | { rows: Record<string, unknown>[] }
      | [Record<string, unknown>[], unknown];
    if (dialect === "mysql") {
      return { rows: (result as [Record<string, unknown>[], unknown])[0] };
    }
    return result as { rows: Record<string, unknown>[] };
  } finally {
    await client.destroy();
  }
}

/**
 * Port of H.resetTestTable({ type, table }) (cy.task("resetTable") →
 * e2e/support/test_tables.js). The knex table factories can't be `require`d
 * from here (ESM), so the two tables this spec uses are rebuilt with the same
 * knex schema-builder calls, dialect-correct for both engines.
 */
export async function resetTestTable({
  type,
  table,
}: {
  type: WritebackDialect;
  table: "scoreboard_actions" | "many_data_types";
}) {
  const client = knexClient(type);
  try {
    if (table === "scoreboard_actions") {
      await buildScoreboardActions(client);
    } else {
      await buildManyDataTypes(client);
    }
  } finally {
    await client.destroy();
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function buildScoreboardActions(client: KnexClient) {
  const tableName = "scoreboard_actions";
  await client.schema.dropTableIfExists(tableName);
  await client.schema.createTable(tableName, (table: any) => {
    table.increments("id").primary();
    table.string("team_name").unique().notNullable();
    table.integer("score").notNullable().defaultTo(0);
    table.string("status").notNullable().defaultTo("active");
    table.timestamps(false, true);
  });
  await client(tableName).insert([
    { team_name: "Amorous Aardvarks", score: 0 },
    { team_name: "Bouncy Bears", score: 10 },
    { team_name: "Cuddly Cats", score: 20 },
    { team_name: "Dusty Ducks", score: 25 },
    { team_name: "Energetic Elephants", score: 30 },
    { team_name: "Funky Flamingos", score: 30, status: "suspended" },
    { team_name: "Generous Giraffes", score: 30 },
    { team_name: "Hilarious Hippos", score: 40 },
    { team_name: "Incredible Iguanas", score: 50, status: "retired" },
    { team_name: "Jolly Jellyfish", score: 60 },
    { team_name: "Kind Koalas", score: 70 },
    { team_name: "Lively Lemurs", score: 80 },
    { team_name: "Mighty Monkeys", score: 90, status: "inactive" },
    { team_name: "Nifty Narwhals", score: 100 },
  ]);
}

async function buildManyDataTypes(client: KnexClient) {
  const tableName = "many_data_types";
  await client.schema.dropTableIfExists(tableName);
  await client.schema.createTable(tableName, (table: any) => {
    table.increments("id").primary();
    table.uuid("uuid");
    table.integer("integer");
    table.integer("integerUnsigned").unsigned();
    table.tinyint("tinyint");
    table.tinyint("tinyint1", 1);
    table.smallint("smallint");
    table.mediumint("mediumint");
    table.bigInteger("bigint");
    table.string("string");
    table.text("text");
    table.float("float");
    table.double("double");
    table.decimal("decimal");
    table.boolean("boolean");
    table.date("date");
    table.dateTime("datetime", { useTz: false });
    table.dateTime("datetimeTZ", { useTz: true });
    table.time("time");
    table.timestamp("timestamp", { useTz: false });
    table.timestamp("timestampTZ", { useTz: true });
    table.json("json");
    table.jsonb("jsonb");
    table.enu("enum", ["alpha", "beta", "gamma", "delta"]);
    table.binary("binary");
  });
  // The two rows from e2e/support/test_tables_data.js (many_data_types_rows),
  // re-exported below so the spec's changeValue oldValue assertions match.
  await client(tableName).insert(
    MANY_DATA_TYPES_ROWS as unknown as Record<string, unknown>[],
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Port of many_data_types_rows (e2e/support/test_tables_data.js). */
export const MANY_DATA_TYPES_ROWS = [
  {
    uuid: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    integer: 1,
    integerUnsigned: 2,
    tinyint: -128,
    tinyint1: 1,
    smallint: 100,
    mediumint: 1000,
    bigint: 100000,
    string: "string",
    text: "text",
    float: 1.1,
    double: 1.11,
    decimal: 1.11,
    boolean: true,
    date: "2020-01-01",
    datetime: "2020-01-01 08:35:55",
    datetimeTZ: "2020-01-01 08:35:55",
    time: "08:35:55",
    timestamp: "2020-01-01 08:35:55",
    timestampTZ: "2020-01-01 08:35:55",
    json: { a: 10, b: 20, c: [6, 7, 8], d: "foobar" },
    jsonb: { a: 20, b: 30 },
    enum: "beta",
    binary: "binary",
  },
  {
    uuid: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
    integer: 4,
    integerUnsigned: 5,
    tinyint: 127,
    tinyint1: 1,
    smallint: 100,
    mediumint: 1002,
    bigint: 100002,
    string: "string of characters",
    text: "text block",
    float: 21.1,
    double: 21.11,
    decimal: 21.11,
    boolean: false,
    date: "2020-02-01",
    datetime: "2020-02-01 12:30:30",
    datetimeTZ: "2020-02-01 12:30:30",
    time: "12:30:30",
    timestamp: "2020-02-01 12:30:30",
    timestampTZ: "2020-02-01 12:30:30",
    json: { a: 10, b: 20, c: [9, 10, 11], d: "foobarbaz" },
    jsonb: { a: 20, b: 30 },
    enum: "beta",
    binary: "binary",
  },
] as const;

/**
 * Port of H.createModelFromTableName (e2e-qa-databases-helpers.js) — unlike
 * the shared interactive-embedding.ts port, this RETURNS the model id (the
 * upstream spec wraps it as @modelId and reads it back throughout).
 */
export async function createModelFromTableName(
  api: MetabaseApi,
  {
    tableName,
    modelName = "Test Action Model",
    databaseId = WRITABLE_DB_ID,
  }: { tableName: string; modelName?: string; databaseId?: number },
): Promise<number> {
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
  const { id } = (await response.json()) as { id: number };
  return id;
}

/** Port of H.createAction (e2e-action-helpers.js). */
export async function createAction(
  api: MetabaseApi,
  actionDetails: Record<string, unknown>,
): Promise<{ id: number }> {
  const response = await api.post("/api/action", actionDetails);
  return (await response.json()) as { id: number };
}

/** Port of H.createImplicitAction (e2e-action-helpers.js). */
export async function createImplicitAction(
  api: MetabaseApi,
  { model_id, kind }: { model_id: number; kind: "create" | "update" | "delete" },
): Promise<{ id: number }> {
  return createAction(api, {
    kind: `row/${kind}`,
    name: kind.charAt(0).toUpperCase() + kind.slice(1),
    type: "implicit",
    model_id,
  });
}

let nextUnsavedDashboardCardId = 0;

/**
 * Port of H.getActionCardDetails (e2e-dashboard-helpers.ts) — the shared
 * click-behavior.ts copy takes no args; this one accepts action_id/label like
 * the upstream helper.
 */
export function getActionCardDetails({
  id = --nextUnsavedDashboardCardId,
  col = 0,
  row = 0,
  label = "Action card",
  action_id,
  parameter_mappings,
}: {
  id?: number;
  col?: number;
  row?: number;
  label?: string;
  action_id?: number;
  parameter_mappings?: unknown;
} = {}) {
  return {
    id,
    action_id,
    card_id: null,
    col,
    row,
    size_x: 4,
    size_y: 1,
    series: [],
    parameter_mappings,
    visualization_settings: {
      actionDisplayType: "button",
      virtual_card: {
        name: null,
        display: "action",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      "button.label": label,
    },
  };
}

/**
 * Port of addWidgetStringFilter (native-filters/helpers/e2e-field-filter-helpers.js):
 * type into the first non-hidden input of the first open popover, then click
 * the confirm button.
 */
export async function addWidgetStringFilter(
  page: Page,
  value: string,
  { buttonLabel = "Add filter" }: { buttonLabel?: string } = {},
) {
  const input = popover(page)
    .first()
    .locator("input:not([type=hidden])")
    .first();
  await input.fill(value);
  await page.getByRole("button", { name: buttonLabel }).click();
}

/**
 * Port of H.moveDnDKitListElement(dataTestId, { startIndex, dropIndex }):
 * drag the element at startIndex onto the one at dropIndex. Upstream fires
 * synthetic pointer events; here real mouse input drives dnd-kit's sensors
 * (see dashboard-cards.ts moveDnDKitElement). Elements are matched by a
 * regex over the data-testid, exactly like the Cypress helper.
 */
export async function moveDnDKitListElement(
  page: Page,
  dataTestId: string,
  { startIndex, dropIndex }: { startIndex: number; dropIndex: number },
) {
  const elements = page.getByTestId(new RegExp(dataTestId));
  const dragBox = await elements.nth(startIndex).boundingBox();
  const dropBox = await elements.nth(dropIndex).boundingBox();
  if (!dragBox || !dropBox) {
    throw new Error("Cannot drag list elements without bounding boxes");
  }
  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  const endX = dropBox.x + dropBox.width / 2;
  const endY = dropBox.y + dropBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed the sensor's activation constraint first.
  await page.mouse.move(startX + 20, startY + 20, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/** The click-behavior sidebar. Cypress used a bare cy.get("aside"). */
export function aside(page: Page): Locator {
  return page.locator("aside");
}
