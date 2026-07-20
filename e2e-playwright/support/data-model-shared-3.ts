/**
 * Per-spec helpers for the data-model-shared-3 port
 * (e2e/test/scenarios/data-model/data-model-shared-3.cy.spec.ts).
 *
 * The shared surface lives in support/data-model.ts (data-model-shared-1) and
 * support/data-model-shared-2.ts (data-model-shared-2); both are imported
 * READ-ONLY. This module only adds what neither carries. New module per
 * PORTING rule 9 — shared modules are not edited.
 *
 * Port notes:
 * - The extra `FieldSection` getters are transcribed from
 *   e2e/support/helpers/e2e-datamodel-helpers.ts (verified line-by-line against
 *   `getRawFieldName`/`getFieldDisplayValuesInput`/… at lines 441-527).
 *   testing-library's `findByPlaceholderText` / `findByLabelText` are EXACT, so
 *   every getter passes `{ exact: true }` (`getByLabel`/`getByPlaceholder`
 *   default to a SUBSTRING match, which would silently loosen them).
 * - `H.tooltip()` is `cy.get(".mb-mantine-Tooltip-tooltip, [role='tooltip']")`,
 *   i.e. a potentially MULTI-element subject. chai-jquery evaluates
 *   `should("contain.text", x)` / `should("have.text", x)` on such a subject as
 *   a CONCATENATION and `should("be.visible")` as an ANY-OF, so the three
 *   assertion helpers below reproduce those three different semantics rather
 *   than reaching for `.first()` (which would strengthen two of them).
 * - `H.undoToast()` is likewise multi-element (two toasts overlap whenever a
 *   test fires two metadata edits in a row), so the toast helpers below
 *   reproduce the same concatenation semantics. See `verifyAndCloseToast`.
 * - `blurFocusedElement` exists because `.blur()` must hit the element Cypress
 *   typed into: these field-name inputs are located via their row's accessible
 *   name, which CHANGES as you type, so re-resolving the locator to blur it
 *   deadlocks (PORTING).
 */
import type { Locator, Page, Request, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { FieldSection as SharedFieldSection } from "./data-model-shared-2";
import { expect } from "./fixtures";
import { modal } from "./ui";
import { undoToast } from "./metrics";

/**
 * The FieldSection getters this spec needs on top of the shared-1 / shared-2
 * ones. Spread so call sites keep the single `FieldSection.` namespace the
 * Cypress spec used.
 */
export const FieldSection = {
  ...SharedFieldSection,

  /** getRawFieldName: findByLabelText("Field name"). */
  getRawName: (page: Page): Locator =>
    SharedFieldSection.get(page).getByLabel("Field name", { exact: true }),

  /** getFieldDisplayValuesInput: placeholder "Select display values". */
  getDisplayValuesInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Select display values", {
      exact: true,
    }),

  /** getFieldDisplayValuesFkTargetInput: placeholder "Choose a field". */
  getDisplayValuesFkTargetInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Choose a field", {
      exact: true,
    }),

  /** getFieldUnfoldJsonInput: placeholder "Select whether to unfold JSON". */
  getUnfoldJsonInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder(
      "Select whether to unfold JSON",
      { exact: true },
    ),

  /** getFieldStyleInput: findByLabelText("Style"). */
  getStyleInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByLabel("Style", { exact: true }),

  /** getFieldPrefixInput: findByTestId("prefix"). */
  getPrefixInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByTestId("prefix"),

  /** getFieldSuffixInput: findByTestId("suffix"). */
  getSuffixInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByTestId("suffix"),
};

/** The `Json:` style prefix chip rendered next to an unfolded field's name. */
export function namePrefix(scope: Page | Locator): Locator {
  return scope.getByTestId("name-prefix");
}

// === H.tooltip() assertions, with chai-jquery's multi-subject semantics ====

/** Port of H.tooltip(). */
export function tooltip(page: Page): Locator {
  return page.locator(".mb-mantine-Tooltip-tooltip, [role='tooltip']");
}

/**
 * `tooltip().should("contain.text", x)` — chai-jquery CONCATENATES the text of
 * every matched element, so `.first()` would silently strengthen this.
 */
export async function expectTooltipContainsText(page: Page, text: string) {
  await expect
    .poll(async () => (await tooltip(page).allTextContents()).join(""), {
      timeout: 15_000,
    })
    .toContain(text);
}

/** `tooltip().should("have.text", x)` — also a concatenation (`$el.text()`). */
export async function expectTooltipHasText(page: Page, text: string) {
  await expect
    .poll(async () => (await tooltip(page).allTextContents()).join(""), {
      timeout: 15_000,
    })
    .toBe(text);
}

/**
 * `tooltip().should("be.visible")` — chai-jquery resolves this to
 * `$el.is(":visible")`, which is TRUE when ANY element matches (PORTING
 * rule 3), so the faithful port is "at least one visible match".
 */
export async function expectTooltipVisible(page: Page) {
  await expect(tooltip(page).filter({ visible: true }).first()).toBeVisible();
}

/** `tooltip().should("not.exist")`. */
export async function expectNoTooltip(page: Page) {
  await expect(tooltip(page)).toHaveCount(0);
}

// === H.undoToast() assertions =============================================

/**
 * `H.undoToast()` is `getByTestId("toast-undo")`, a MULTI-element subject
 * whenever two metadata edits land close together (this spec does exactly that
 * — "Display values of Rating updated" fires twice) or while an outgoing toast
 * is still running its exit animation. chai-jquery's `contain.text` on such a
 * subject is a CONCATENATION, so `expect(undoToast(page)).toContainText(x)` is
 * a strict-mode violation and `.first()` would silently STRENGTHEN it.
 *
 * data-model-shared-2 already carries both helpers in exactly that shape —
 * concatenated assertion plus a `dispatchEvent` close (a force-click would move
 * the real mouse and hit whatever is topmost, which at two call sites here is
 * the modal the toast sits behind). Re-exported rather than re-implemented;
 * Cypress has exactly one `verifyAndCloseToast`, so consolidating toward it
 * stays faithful. Deliberately NOT the shared `data-model.ts:235` version,
 * which is the measured strict-mode + force-click bug.
 */
export {
  expectToastsContainText,
  verifyAndCloseToast,
} from "./data-model-shared-2";

/** `H.undoToast().should("not.exist")`. */
export async function expectNoToast(page: Page) {
  await expect(undoToast(page)).toHaveCount(0);
}

// === waits ================================================================

/**
 * 🔴 Port of Cypress's ALIAS QUEUE, not of `waitForResponse`.
 *
 * `cy.wait("@alias")` pops the next response that has not yet been consumed,
 * INCLUDING one that already fired before the wait was reached;
 * `page.waitForResponse` only ever sees the future. That difference is not
 * academic here — measured on "should correctly apply and display custom
 * remapping for numeric values": selecting "Custom mapping" fires
 * `POST /api/field/:id/dimension` at SELECTION time, and upstream's
 * `cy.wait("@updateFieldDimension")` after the modal's Save is satisfied
 * RETROACTIVELY by that earlier response. A literal `waitForResponse`
 * registered before the Save click therefore deadlocked for 30s.
 *
 * Register where Cypress registers its `cy.intercept` (the beforeEach), then
 * `pop()` once per `cy.wait`.
 */
export type ResponseQueue = { pop(timeout?: number): Promise<Response> };

export function responseQueue(
  page: Page,
  predicate: (response: Response) => boolean,
): ResponseQueue {
  const seen: Response[] = [];
  let consumed = 0;
  page.on("response", (response) => {
    if (predicate(response)) {
      seen.push(response);
    }
  });
  return {
    async pop(timeout = 30_000) {
      await expect
        .poll(() => seen.length, { timeout })
        .toBeGreaterThan(consumed);
      return seen[consumed++];
    },
  };
}

/** POST /api/field/:id/dimension — the spec's `@updateFieldDimension`. */
export function fieldDimensionQueue(page: Page): ResponseQueue {
  return responseQueue(
    page,
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/field\/\d+\/dimension$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/field/:id/values — the spec's `@updateFieldValues`. */
export function fieldValuesQueue(page: Page): ResponseQueue {
  return responseQueue(
    page,
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/field\/\d+\/values$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/database/:id/sync_schema — the spec's `@sync_schema`. */
export function waitForSyncSchema(page: Page, dbId: number): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/database/${dbId}/sync_schema`,
  );
}

/**
 * Passive recorder of `PUT /api/field/:id` — the port of the spec's
 * `cy.intercept("PUT", "/api/field/*", cy.spy().as("updateFieldSpy"))` +
 * `cy.get("@updateFieldSpy").should("not.have.been.called")`.
 * Install before the interaction under test.
 */
export function fieldPutRecorder(page: Page): { urls: string[] } {
  const urls: string[] = [];
  const predicate = (request: Request) =>
    request.method() === "PUT" &&
    /^\/api\/field\/\d+$/.test(new URL(request.url()).pathname);
  page.on("request", (request) => {
    if (predicate(request)) {
      urls.push(request.url());
    }
  });
  return { urls };
}

// === interactions =========================================================

/**
 * Blur whatever input/textarea currently holds focus.
 *
 * Cypress's `.clear().type(x).blur()` blurs the element it typed into. These
 * field-name inputs are addressed through their row's accessible name, which
 * updates as you type — and only settles after the PUT that the blur itself
 * triggers — so re-resolving the locator by either the old or the new name
 * deadlocks (PORTING). Blur the focused node instead.
 */
export async function blurFocusedElement(page: Page) {
  await page.locator("input:focus, textarea:focus").blur();
}

/**
 * `cy.findAllByPlaceholderText("Enter value").filter("[value='null']")` —
 * the remapping modal's input whose *attribute* value is the literal `null`.
 * jQuery's `.filter("[value=…]")` matches the ATTRIBUTE, and so does the CSS
 * used to locate it here.
 *
 * 🔴 The returned locator is deliberately resolved to a POSITIONAL `nth()`,
 * not left as the attribute selector. This is the placeholder-trap family:
 * React keeps the `value` attribute in sync, so the moment `.clear()` empties
 * the input the attribute selector stops matching and the very next
 * `pressSequentially` re-resolves to nothing and burns the full timeout —
 * measured, and the fingerprint points at the shared `replaceValue` helper
 * rather than at the selector. Cypress never saw this because its chain holds
 * the already-resolved subject. Resolve once, address by index thereafter.
 */
export async function remappingInputWithAttrValue(
  page: Page,
  value: string,
): Promise<Locator> {
  const inputs = modal(page).locator('input[placeholder="Enter value"]');
  let index = -1;
  await expect
    .poll(
      async () => {
        const count = await inputs.count();
        for (let i = 0; i < count; i++) {
          if ((await inputs.nth(i).getAttribute("value")) === value) {
            index = i;
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return inputs.nth(index);
}

// === api ==================================================================

/**
 * Port of the `H.withDatabase` shape this spec uses: the shared
 * `getDatabaseFields` (homepage.ts) returns only the field maps, but upstream's
 * `DatabaseMap` also carries `<TABLE>_ID` keys, and the spec needs
 * `NUMBER_WITH_NULLS_ID`. Same endpoint, table ids kept.
 */
export async function getDatabaseTableIds(
  api: MetabaseApi,
  databaseId: number,
): Promise<Record<string, number>> {
  const response = await api.get(
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  );
  const body = (await response.json()) as {
    tables?: { name: string; id: number }[];
  };
  const result: Record<string, number> = {};
  for (const table of body.tables ?? []) {
    result[table.name.toUpperCase()] = table.id;
  }
  return result;
}

/** GET /api/database/:id/schemas — the spec reads `body[0]`. */
export async function getDatabaseSchemas(
  api: MetabaseApi,
  databaseId: number,
): Promise<string[]> {
  const response = await api.get(`/api/database/${databaseId}/schemas`);
  return (await response.json()) as string[];
}

// === writable-postgres fixture ============================================

/**
 * Port of `H.resetTestTable({ type: "postgres", table: "many_data_types" })`
 * (cy.task("resetTable") → e2e/support/test_tables.js `many_data_types`).
 * The schema builder and both rows are transcribed verbatim from
 * e2e/support/test_tables.js / test_tables_data.js.
 *
 * `knex`/`pg` are not dependencies of this package; they resolve from the
 * repo-root node_modules (the same drivers Cypress uses), which is why the
 * require is lazy — the module must still load when PW_QA_DB_ENABLED is off.
 */
export async function resetManyDataTypesTable() {
  const tableName = "many_data_types";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  const client = Knex({
    client: "pg",
    connection: {
      host: "localhost",
      user: "metabase",
      password: "metasample123",
      database: "writable_db",
      port: 5404,
      ssl: false,
    },
  });

  try {
    await client.schema.dropTableIfExists(tableName);
    await client.schema.createTable(tableName, (table: KnexTableBuilder) => {
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
    await client(tableName).insert(MANY_DATA_TYPES_ROWS);
  } finally {
    await client.destroy();
  }
}

/** Verbatim from e2e/support/test_tables_data.js `many_data_types_rows`. */
const MANY_DATA_TYPES_ROWS = [
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
].map((row) => ({
  ...row,
  // node-postgres serialises a JS object to `[object Object]` for json/jsonb
  // columns unless it is pre-stringified; knex's Cypress-side task ran through
  // the same driver but Cypress's task boundary JSON-encoded the rows first.
  json: JSON.stringify(row.json),
  jsonb: JSON.stringify(row.jsonb),
}));

/**
 * Poll until the app DB reflects a sync that actually re-read
 * `many_data_types` — i.e. the unfolded `json → a` field exists on the table.
 *
 * `resyncDatabase({ tables })` alone is NOT enough here (PORTING): a stale
 * `initial_sync_status: "complete"` row for `many_data_types` left behind by an
 * earlier session satisfies it instantly. Anchoring on a field the fresh sync
 * must have produced is the "prove the NEW sync ran" form that note asks for.
 *
 * Matched on `nfc_path` (`["json","a"]`), NOT on a field name. The unfolded
 * field's backend `name` is `"json → a"` — probed against the running backend,
 * not assumed. (The FE separately renders `json.a` as the raw name, which is
 * what the spec asserts; that string does not exist in the API payload, and an
 * earlier version of this helper guessed it and made all 6 tests time out.)
 */
export async function waitForUnfoldedJsonField(
  api: MetabaseApi,
  dbId: number,
  { present = true }: { present?: boolean } = {},
) {
  await expect
    .poll(
      async () => {
        const response = await api.get(`/api/database/${dbId}/metadata`);
        const body = (await response.json()) as {
          tables?: { name: string; fields?: { nfc_path?: string[] | null }[] }[];
        };
        const table = body.tables?.find(
          (candidate) => candidate.name === "many_data_types",
        );
        return (table?.fields ?? []).some(
          (field) =>
            field.nfc_path?.length === 2 &&
            field.nfc_path[0] === "json" &&
            field.nfc_path[1] === "a",
        );
      },
      { timeout: 120_000, intervals: [1000] },
    )
    .toBe(present);
}

type KnexTableBuilder = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [method: string]: (...args: any[]) => any;
};

type KnexClient = {
  schema: {
    dropTableIfExists(name: string): Promise<unknown>;
    createTable(
      name: string,
      cb: (table: KnexTableBuilder) => void,
    ): Promise<unknown>;
  };
  (tableName: string): {
    insert(rows: Record<string, unknown>[]): Promise<unknown>;
  };
  destroy(): Promise<void>;
};
