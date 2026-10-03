/**
 * Helpers for the sql-field-filter-types and native-filters-remapping spec
 * ports. Lives in its own file so the shared support modules stay untouched.
 * Ports of:
 * - H.filterWidget({ name }) (e2e-ui-elements-helpers.js) — the shared
 *   dashboard.ts filterWidget has no name filter.
 * - H.resetTestTable({ type: "postgres", table: "many_data_types" })
 *   (cy.task("resetTable") → e2e/support/db_tasks.js → test_tables.js).
 *   The Cypress task builds the table with knex; node can't import those ESM
 *   helpers from here, so this replays the *exact* DDL knex emits for the
 *   many_data_types factory (captured via knex({client:"pg"}).toSQL())
 *   through the same pg client schema-viewer.ts uses, plus the two rows from
 *   test_tables_data.js.
 * - H.createNativeQuestion (api/createQuestion.ts question()) for cards that
 *   need `parameters` in the POST *and* the enable_embedding follow-up PUT —
 *   the existing ports cover one or the other, not both
 *   (sharing.ts createNativeQuestion: no PUT; native-extras.ts
 *   createNativeCard: no parameters).
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { icon } from "./dashboard-cards";
import { expect } from "./fixtures";
import { SAMPLE_DB_ID } from "./sample-data";
import { queryWritableDB } from "./schema-viewer";

/**
 * Port of H.runNativeQuery for specs that call it on SAVED questions:
 * a clean saved question runs through POST /api/card/:id/query, a dirty or
 * ad-hoc one through POST /api/dataset — which is why the Cypress spec used
 * `{ wait: false }` (its "@dataset" intercept would never resolve after
 * save). Waiting on either endpoint is strictly stronger than the Cypress
 * no-wait + play-icon check, and covers both states with one helper.
 */
export async function runNativeQueryEitherEndpoint(page: Page) {
  const queryResponse = page.waitForResponse((response) => {
    const { pathname } = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      (pathname === "/api/dataset" || /^\/api\/card\/\d+\/query$/.test(pathname))
    );
  });
  await icon(
    page.getByTestId("native-query-editor-container"),
    "play",
  ).click();
  await queryResponse;
  await expect(icon(page, "play")).toHaveCount(0);
}

/**
 * Port of H.filterWidget({ name }): all parameter widgets whose text contains
 * the name. Cypress `:contains()` is a case-sensitive substring → regex.
 */
export function filterWidgetByName(page: Page, name: string): Locator {
  return page
    .getByTestId("parameter-widget")
    .filter({ hasText: new RegExp(escapeRegExp(name)) });
}

/**
 * Port of H.resetTestTable({ type: "postgres", table: "many_data_types" }).
 * DDL is the verbatim knex output for test_tables.js's many_data_types
 * factory; rows are many_data_types_rows from test_tables_data.js.
 */
export async function resetManyDataTypesTable() {
  await queryWritableDB(`
    drop table if exists "many_data_types";
    create table "many_data_types" (
      "id" serial primary key, "uuid" uuid, "integer" integer,
      "integerUnsigned" integer, "tinyint" smallint, "tinyint1" smallint,
      "smallint" smallint, "mediumint" integer, "bigint" bigint,
      "string" varchar(255), "text" text, "float" real,
      "double" double precision, "decimal" decimal(8, 2), "boolean" boolean,
      "date" date, "datetime" timestamp, "datetimeTZ" timestamptz,
      "time" time, "timestamp" timestamp, "timestampTZ" timestamptz,
      "json" json, "jsonb" jsonb,
      "enum" text check ("enum" in ('alpha', 'beta', 'gamma', 'delta')),
      "binary" bytea
    );
    insert into "many_data_types"
      ("uuid", "integer", "integerUnsigned", "tinyint", "tinyint1",
       "smallint", "mediumint", "bigint", "string", "text", "float",
       "double", "decimal", "boolean", "date", "datetime", "datetimeTZ",
       "time", "timestamp", "timestampTZ", "json", "jsonb", "enum", "binary")
    values
      ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 1, 2, -128, 1,
       100, 1000, 100000, 'string', 'text', 1.1,
       1.11, 1.11, true, '2020-01-01', '2020-01-01 08:35:55',
       '2020-01-01 08:35:55', '08:35:55', '2020-01-01 08:35:55',
       '2020-01-01 08:35:55',
       '{"a":10,"b":20,"c":[6,7,8],"d":"foobar"}',
       '{"a":20,"b":30}', 'beta', 'binary'::bytea),
      ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 4, 5, 127, 1,
       100, 1002, 100002, 'string of characters', 'text block', 21.1,
       21.11, 21.11, false, '2020-02-01', '2020-02-01 12:30:30',
       '2020-02-01 12:30:30', '12:30:30', '2020-02-01 12:30:30',
       '2020-02-01 12:30:30',
       '{"a":10,"b":20,"c":[9,10,11],"d":"foobarbaz"}',
       '{"a":20,"b":30}', 'beta', 'binary'::bytea);
  `);
}

type NativeQuestionDetails = {
  name?: string;
  display?: string;
  database?: number;
  collection_id?: number | null;
  native: Record<string, unknown>;
  parameters?: Record<string, unknown>[];
  enable_embedding?: boolean;
  embedding_params?: Record<string, string>;
};

/**
 * Port of H.createNativeQuestion for the remapping spec's card shape:
 * `parameters` go in the POST (like the Cypress question() helper), and —
 * exactly like that helper — enable_embedding/embedding_params need a
 * follow-up PUT because POST /api/card ignores them.
 */
export async function createNativeQuestionWithParameters(
  api: MetabaseApi,
  details: NativeQuestionDetails,
): Promise<{ id: number }> {
  const {
    name = "test question",
    display = "table",
    database = SAMPLE_DB_ID,
    collection_id,
    native,
    parameters,
    enable_embedding = false,
    embedding_params,
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    collection_id,
    parameters,
    visualization_settings: {},
    dataset_query: { type: "native", native, database },
  });
  const card = (await response.json()) as { id: number };
  if (enable_embedding) {
    await api.put(`/api/card/${card.id}`, {
      type: "question",
      enable_embedding,
      embedding_params,
    });
  }
  return card;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
