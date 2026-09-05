/**
 * Per-spec helpers for the embedding-hub port
 * (e2e/test/scenarios/embedding/embedding-hub/embedding-hub.cy.spec.ts).
 *
 * Kept in its own module per PORTING rule 9 — nothing here edits a shared
 * support file.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { addPostgresDatabase as postQaPostgresDatabase } from "./documents-core";
import { queryWritableDB } from "./actions-on-dashboards";

/** Mirrors ALL_EXTERNAL_USERS_GROUP_ID (cypress_sample_instance_data.js):
 * the magic "All tenant users" group, a fixed id in every snapshot. */
export const ALL_EXTERNAL_USERS_GROUP_ID = 3;

/** Mirrors SAMPLE_DB_TABLES.STATIC_ORDERS_ID (cypress_data.js). */
export const STATIC_ORDERS_ID = 5;

export const QA_DB_SKIP_MESSAGE =
  "Requires the QA Postgres containers and their postgres-12 / postgres-writable snapshots (set PW_QA_DB_ENABLED)";

/** Port of cy.findByTestId("admin-layout-content"). */
export function adminLayoutContent(page: Page): Locator {
  return page.getByTestId("admin-layout-content");
}

/**
 * Port of Cypress's `.closest("button")` on a setup-guide card title.
 *
 * Worth knowing what this actually resolves to: the hub cards are Mantine
 * `Card`s (divs), so the nearest `button` ancestor is the Mantine
 * `Stepper.Step` (an `UnstyledButton`) wrapping the WHOLE step. Each hub step
 * happens to hold exactly one card (use-get-embedding-hub-steps.ts), so the
 * scope is unambiguous — but it is the step, not the card.
 */
export function closestButton(target: Locator): Locator {
  return target.locator("xpath=ancestor-or-self::button[1]");
}

/**
 * Port of H.addPostgresDatabase (e2e-qa-databases-helpers.js) INCLUDING its
 * sync wait. The shared documents-core copy only does the POST; the Cypress
 * helper additionally blocks on `initial_sync_status === "complete"` and on
 * field analysis, then gives up optimistically. Reproduced here so the
 * connection-impersonation tests see a fully synced database, as upstream does.
 */
export async function addPostgresDatabase(
  api: MetabaseApi,
  displayName = "QA Postgres12",
): Promise<number> {
  const { id } = await postQaPostgresDatabase(api, displayName);

  // recursiveCheck: up to 40 × 500ms
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const database = (await (await api.get(`/api/database/${id}`)).json()) as {
      initial_sync_status: string;
    };
    if (database.initial_sync_status === "complete") {
      break;
    }
  }

  // recursiveCheckFields: up to 20 × 500ms
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const schemas = (await (
      await api.get(`/api/database/${id}/schemas`)
    ).json()) as string[];
    const [schema] = schemas;
    if (!schema) {
      continue;
    }
    const tables = (await (
      await api.get(`/api/database/${id}/schema/${encodeURIComponent(schema)}`)
    ).json()) as { id: number }[];
    if (!tables[0]) {
      continue;
    }
    const table = (await (
      await api.get(`/api/table/${tables[0].id}/query_metadata`)
    ).json()) as {
      fields: { semantic_type: string | null; last_analyzed: string | null }[];
    };
    const field = table.fields.find(
      (field) => field.semantic_type !== "type/PK",
    );
    if (!field || field.last_analyzed) {
      break;
    }
  }

  return id;
}

/**
 * Port of H.resetTestTable({ type: "postgres", table: "multi_schema" })
 * (cy.task("resetTable") → e2e/support/test_tables.js `multi_schema`).
 *
 * The shared actions-on-dashboards resetTestTable only knows
 * scoreboard_actions / many_data_types, so the multi_schema fixture is rebuilt
 * here with the SQL knex's schema builder emits for it (varchar(255) / integer,
 * quoted mixed-case identifiers).
 */
export async function resetMultiSchemaTable(): Promise<void> {
  const schemas: Record<string, Record<string, { name: string; score: number }[]>> =
    {
      Domestic: {
        Animals: [
          { name: "Duck", score: 10 },
          { name: "Horse", score: 20 },
          { name: "Cow", score: 30 },
        ],
      },
      Wild: {
        Animals: [
          { name: "Snake", score: 10 },
          { name: "Lion", score: 20 },
          { name: "Elephant", score: 30 },
        ],
        Birds: [{ name: "Toucan", score: 50 }],
      },
    };

  for (const [schema, tables] of Object.entries(schemas)) {
    await queryWritableDB(
      `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
      "postgres",
    );
    for (const [table, rows] of Object.entries(tables)) {
      await queryWritableDB(
        `DROP TABLE IF EXISTS "${schema}"."${table}"`,
        "postgres",
      );
      await queryWritableDB(
        `CREATE TABLE "${schema}"."${table}" ("name" varchar(255), "score" integer)`,
        "postgres",
      );
      const values = rows
        .map((row) => `('${row.name}', ${row.score})`)
        .join(", ");
      await queryWritableDB(
        `INSERT INTO "${schema}"."${table}" ("name", "score") VALUES ${values}`,
        "postgres",
      );
    }
  }
}
