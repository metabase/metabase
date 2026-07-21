/**
 * Helpers for the admin data-model spec port
 * (e2e/test/scenarios/admin/datamodel/datamodel.cy.spec.ts).
 *
 * New module per PORTING rule 9 — everything that already had a home is
 * imported read-only:
 * - `visitDataModel` / `TablePicker` / `TableSection` / `FieldSection` /
 *   `PreviewSection` / `verifyTablePreview` / `hoverPreviewHeaderCell` /
 *   `hovercard` / `replaceValue` / `resetTestTableMultiSchema` /
 *   `waitForTableUpdate` / `waitForFieldUpdate` from support/data-model.ts
 * - `getSortOrderRadio` / `getSortOrderOption` / `getSortableField(s)` /
 *   `getFieldValuesButton` / `getFilteringInput` / `getDisplayValuesInput` /
 *   `verifyAndCloseToastFirst` / `closeToast` / `blurFocused` from
 *   support/datamodel-data-studio.ts
 * - `updatePermissionsGraph` from support/dashboard-repros.ts
 * - `signInWithCachedSession` from support/permissions.ts
 *
 * Only the items below have no existing home.
 */
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { updatePermissionsGraph } from "./dashboard-repros";
import { TableSection } from "./data-model";
import { closeToast } from "./datamodel-data-studio";
import { expect } from "./fixtures";
import { undoToast } from "./metrics";
import { writableDbConnection } from "./writable-db";

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js). */
export const ALL_USERS_GROUP = 1;

/** Port of H.DataModel.TablePicker.get(). */
export function tablePicker(page: Page): Locator {
  return page.getByTestId("table-picker");
}

/** Port of DataModel.TableSection.getSyncOptionsButton(). */
export function getSyncOptionsButton(page: Page): Locator {
  return TableSection.get(page).getByRole("button", { name: /Sync/ });
}

/** Port of DataModel.TableSection.getSortDoneButton(). */
export function getSortDoneButton(page: Page): Locator {
  return TableSection.get(page).getByRole("button", {
    name: "Done",
    exact: true,
  });
}

/** POST /api/dataset — the spec's `@dataset` alias. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** PUT /api/table — the spec's `@updateTables` alias (bulk visibility). */
export function waitForTablesUpdate(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/table",
  );
}

/** PUT /api/table/:id/fields/order — the spec's `@updateFieldOrder` alias. */
export function waitForUpdateFieldOrder(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/table\/\d+\/fields\/order$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** POST /api/field/:id/dimension — the spec's `@updateFieldDimension` alias. */
export function waitForUpdateFieldDimension(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/field\/\d+\/dimension$/.test(new URL(response.url()).pathname),
  );
}

/**
 * Port of `TablePicker.getTable(name).button(label)`. `cy.button` is
 * `findByRole("button", { name })`, and a string name in testing-library is an
 * EXACT match (rule 1) — load-bearing here, since a substring match on
 * "Hide table" would also resolve "Unhide table".
 *
 * The buttons live in a hover-revealed row action group, so the row is hovered
 * first (rule 4).
 */
export function tableRowButton(row: Locator, label: string): Locator {
  return row.getByRole("button", { name: label, exact: true });
}

export async function clickTableRowButton(row: Locator, label: string) {
  await row.hover();
  await tableRowButton(row, label).click();
}

/**
 * Port of the spec-local verifyToastAndUndo.
 *
 * `.first()` throughout: Playwright fires the next action while the previous
 * toast is still fading, so `undoToast()` is a strict-mode violation waiting
 * to happen (measured on the sibling datamodel-data-studio port). Newest toast
 * is first in DOM order.
 *
 * The close click is `closeToast` (dispatchEvent), not `click({force:true})` —
 * Playwright's force-click moves the real mouse and hits whatever is topmost.
 */
export async function verifyToastAndUndo(page: Page, message: string) {
  await expect(undoToast(page).first()).toContainText(message);
  await undoToast(page)
    .first()
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(undoToast(page).first()).toContainText("Change undone");
  await closeToast(page);
}

/**
 * Port of the spec-local verifyTablesVisible: each named table row carries a
 * "Hide table" button. Upstream asserts `should("exist")`, so presence — not
 * visibility — is the contract (the buttons are hover-revealed).
 */
export async function verifyTablesVisible(
  page: Page,
  getTable: (page: Page, name: string) => Locator,
  tables: string[],
) {
  for (const table of tables) {
    await expect(
      tableRowButton(getTable(page, table), "Hide table"),
    ).toHaveCount(1);
  }
}

/**
 * Port of the spec-local verifyTablesHidden. Upstream asserts
 * `should("be.visible")` on the "Unhide table" button — a hidden table keeps
 * its unhide affordance rendered without hover.
 */
export async function verifyTablesHidden(
  page: Page,
  getTable: (page: Page, name: string) => Locator,
  tables: string[],
) {
  for (const table of tables) {
    await expect(
      tableRowButton(getTable(page, table), "Unhide table")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  }
}

/**
 * The schemas `H.resetTestTable({ table: "multi_schema" })` leaves behind in a
 * pristine `writable_db`. `public` is always present (the postgres default).
 */
const EXPECTED_WRITABLE_SCHEMAS = new Set(["Domestic", "Wild", "public"]);

/**
 * Foreign schemas sitting in the SHARED writable Postgres container
 * (FINDINGS #85). `writable_db` is shared across all five slots and no reset
 * drops schemas it did not create, so a `many_schemas` spec run earlier leaves
 * `Schema A`…`Schema Z` behind for everyone.
 *
 * This matters because the admin table picker is VIRTUALIZED
 * (`@tanstack/react-virtual`, `TablePicker/components/Results.tsx`) and renders
 * ~20 rows. Measured on slot 4: the backend reports 29 schemas, the DOM holds
 * `Domestic, public, Schema A … Schema R`, and `Wild` — which sorts after
 * `Schema Z` — is never in the DOM at all. Tests that click `Wild`, or that
 * count database rows after the tree has scrolled to a selected table, cannot
 * pass no matter how faithful the port is.
 *
 * Deliberately read-only: other QA-DB agents are live, so nothing is dropped.
 */
export async function foreignWritableSchemas(): Promise<string[]> {
  const { Client } = require("pg") as {
    Client: new (config: Record<string, unknown>) => {
      connect(): Promise<void>;
      query(sql: string): Promise<{ rows: { nspname: string }[] }>;
      end(): Promise<void>;
    };
  };
  const client = new Client(writableDbConnection("postgres"));
  await client.connect();
  try {
    const { rows } = await client.query(
      `select nspname from pg_namespace
       where nspname not like 'pg_%' and nspname <> 'information_schema'
       order by 1`,
    );
    return rows
      .map((row) => row.nspname)
      .filter((name) => !EXPECTED_WRITABLE_SCHEMAS.has(name));
  } finally {
    await client.end();
  }
}

/** Port of the spec-local turnTableVisibilityOff. */
export async function turnTableVisibilityOff(api: MetabaseApi, tableId: number) {
  await api.put("/api/table", {
    ids: [tableId],
    visibility_type: "hidden",
  });
}

/** Port of the spec-local setDataModelPermissions. */
export async function setDataModelPermissions(
  api: MetabaseApi,
  { databaseId, tableIds }: { databaseId: number; tableIds: number[] },
) {
  const permissions = Object.fromEntries(tableIds.map((id) => [id, "all"]));

  await updatePermissionsGraph(api, {
    [ALL_USERS_GROUP]: {
      [databaseId]: {
        "data-model": {
          schemas: {
            PUBLIC: permissions,
          },
        },
      },
    },
  });
}
