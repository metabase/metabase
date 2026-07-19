/**
 * Playwright port of
 * e2e/test/scenarios/dependencies/dependency-broken-list.cy.spec.ts
 *
 * @external — the whole spec restores the `postgres-writable` snapshot and
 * builds its fixture by running a *transform* against the writable QA postgres
 * DB (WRITABLE_DB_ID), then breaking that transform so its output table loses
 * the `score`/`status` columns. Neither the writable snapshot nor the QA
 * postgres container exists in the jar harness (nor in CI's `-@external` runs),
 * so the describe is gated on PW_QA_DB_ENABLED. It also needs a pro-self-hosted
 * token (EE dependency diagnostics). The port is faithful-by-construction but
 * runtime-unverified here — a green run on the jar means "correctly skipped",
 * not "passing". Mirrors the dependency-graph / dependency-unreferenced-list
 * precedents.
 *
 * Snowplow helpers are no-op stubs (rule 6): the spike stubs snowplow, so the
 * upstream resetSnowplow / expectNoBadSnowplowEvents /
 * expectUnstructuredSnowplowEvent assertions have nothing to assert against.
 *
 * New helpers live in support/dependency-broken-list.ts. The
 * `DependencyDiagnostics` locators (support/dependency-unreferenced-list.ts),
 * `waitForBackfillComplete` + `createTransform` (support/dependency-graph.ts)
 * and the createQuestion / getTableId / getFieldId / resyncDatabase factories
 * are imported read-only.
 */
import type { Page } from "@playwright/test";

import { resolveToken, type MetabaseApi } from "../support/api";
import {
  BrokenSidebar,
  deleteTransformTable,
  runTransform,
  visitBrokenDependencies,
  waitForBreakingDependencies,
  waitForTransformRuns,
} from "../support/dependency-broken-list";
import { createTransform } from "../support/dependency-graph";
import { DependencyDiagnostics } from "../support/dependency-unreferenced-list";
import { createQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import {
  WRITABLE_DB_ID,
  getTableId,
  resyncDatabase,
} from "../support/schema-viewer";
import { getFieldId } from "../support/table-editing";
import { popover } from "../support/ui";

// TODO: no snowplow-micro container in the spike harness — snowplow is stubbed
// (rule 6). resetSnowplow / expectNoBadSnowplowEvents / the
// dependency_diagnostics_entity_selected + dependency_entity_selected
// assertions are all no-ops here.
const resetSnowplow = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

const TABLE_NAME = "test_transform_table";
const TABLE_DISPLAY_NAME = "Test Transform Table";
const TABLE_TRANSFORM = "Test Transform";
const TABLE_BASED_QUESTION_BROKEN_FIELD =
  "Test Table-based question with broken field";
const TABLE_BASED_QUESTION_BROKEN_EXPRESSION =
  "Test Table-based question with broken expression";
const TABLE_BASED_QUESTION_BROKEN_FILTER =
  "Test Table-based question with broken filter";
const TABLE_BASED_QUESTION_BROKEN_BREAKOUT =
  "Test Table-based question with broken breakout";
const TABLE_BASED_QUESTION_BROKEN_AGGREGATION =
  "Test Table-based question with broken aggregation";
const TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN =
  "Test Table-based question with broken explicit join";
const TABLE_BASED_QUESTION = "Test Table-based question";
const QUESTION_BASED_QUESTION_BROKEN_FILTER =
  "Test Question-based question with broken filter";
const TABLE_BASED_MODEL = "Test Table-based model";
const MODEL_BASED_MODEL_BROKEN_AGGREGATION =
  "Test Model-based model with broken aggregation";

const BROKEN_TABLE_DEPENDENCIES = [TABLE_DISPLAY_NAME];
const BROKEN_TABLE_DEPENDENTS = [
  // NOTE: TABLE_BASED_QUESTION_BROKEN_FIELD is *not* listed here because it's only broken in the `:fields` ref.
  // These are considered "soft" refs that don't break the query, since the QP will quietly drop a bad ref from a
  // `:fields` clause and the query will run successfully.
  TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
  TABLE_BASED_QUESTION_BROKEN_FILTER,
  TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
  TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
  TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
];
const BROKEN_QUESTION_DEPENDENCIES = [TABLE_BASED_QUESTION];
const BROKEN_QUESTION_DEPENDENTS = [QUESTION_BASED_QUESTION_BROKEN_FILTER];
const BROKEN_MODEL_DEPENDENCIES = [TABLE_BASED_MODEL];
const BROKEN_MODEL_DEPENDENTS = [MODEL_BASED_MODEL_BROKEN_AGGREGATION];

const BROKEN_DEPENDENCIES = [
  ...BROKEN_TABLE_DEPENDENCIES,
  ...BROKEN_QUESTION_DEPENDENCIES,
  ...BROKEN_MODEL_DEPENDENCIES,
];

const BROKEN_DEPENDENCIES_SORTED_BY_NAME = [
  TABLE_BASED_MODEL,
  TABLE_BASED_QUESTION,
  TABLE_DISPLAY_NAME,
];

const BROKEN_DEPENDENCIES_SORTED_BY_LOCATION = [
  TABLE_BASED_QUESTION, // Bobby Tables's personal collection
  TABLE_BASED_MODEL, // Our analytics
  TABLE_DISPLAY_NAME, // Writable Postgres
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS = [
  TABLE_BASED_QUESTION, // 1 error: PRICE
  TABLE_BASED_MODEL, // 1 error: AMOUNT
  TABLE_DISPLAY_NAME, // 1 error: SCORE; plus 1 "soft" error on STATUS, which is only in a `:fields` list.
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS = [
  TABLE_BASED_QUESTION, // 1 question
  TABLE_BASED_MODEL, // 1 model
  TABLE_DISPLAY_NAME, // 6 questions
];

const BROKEN_DEPENDENTS = [
  ...BROKEN_TABLE_DEPENDENTS,
  ...BROKEN_QUESTION_DEPENDENTS,
  ...BROKEN_MODEL_DEPENDENTS,
];

// Port of the `@transformId` Cypress alias: created in beforeEach, consumed by
// the afterEach that drops the transform's output table. The suite runs
// serially (one worker per backend), so a module-scoped handle is equivalent.
let transformId: number | null = null;

test.describe("scenarios > dependencies > broken list", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED || !resolveToken("pro-self-hosted"),
    "Requires the writable postgres QA database (set PW_QA_DB_ENABLED) and a pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    transformId = null;
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await createContent(mb.api);
    await resetSnowplow();
  });

  test.afterEach(async ({ mb }) => {
    if (transformId != null) {
      await deleteTransformTable(mb.api, transformId);
    }
    await expectNoBadSnowplowEvents();
  });

  test.describe("analysis", () => {
    test("should show broken dependencies", async ({ page }) => {
      await visitBrokenDependencies(page);
      await checkList(page, {
        visibleEntities: BROKEN_DEPENDENCIES,
        hiddenEntities: BROKEN_DEPENDENTS,
      });
    });
  });

  test.describe("selecting entities", () => {
    test("should show sidebar for broken dependents and trigger snowplow event", async ({
      page,
    }) => {
      await visitBrokenDependencies(page);

      // table dependents
      await DependencyDiagnostics.list(page)
        .getByText(TABLE_DISPLAY_NAME, { exact: true })
        .click();
      await checkSidebar(page, {
        title: TABLE_DISPLAY_NAME,
        transform: TABLE_TRANSFORM,
        missingColumns: ["score"],
        brokenDependents: BROKEN_TABLE_DEPENDENTS,
      });
      await expectUnstructuredSnowplowEvent({
        event: "dependency_diagnostics_entity_selected",
        triggered_from: "broken",
        event_detail: "table",
      });

      // question dependents
      await DependencyDiagnostics.list(page)
        .getByText(TABLE_BASED_QUESTION, { exact: true })
        .click();
      await checkSidebar(page, {
        title: TABLE_BASED_QUESTION,
        missingColumns: ["PRICE"],
        brokenDependents: BROKEN_QUESTION_DEPENDENTS,
      });

      // model dependents
      await DependencyDiagnostics.list(page)
        .getByText(TABLE_BASED_MODEL, { exact: true })
        .click();
      await checkSidebar(page, {
        title: TABLE_BASED_MODEL,
        missingColumns: ["AMOUNT"],
        brokenDependents: BROKEN_MODEL_DEPENDENTS,
      });

      // snowplow event when dependency graph link is clicked
      await page
        .getByRole("link", { name: "View in dependency graph", exact: true })
        .click();
      await expectUnstructuredSnowplowEvent({
        event: "dependency_entity_selected",
        triggered_from: "diagnostics-broken-list",
        event_detail: "card",
      });
    });
  });

  test.describe("search", () => {
    test("should search for entities", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        TABLE_DISPLAY_NAME,
      );
      await checkList(page, {
        visibleEntities: [TABLE_DISPLAY_NAME],
        hiddenEntities: [TABLE_BASED_QUESTION, TABLE_BASED_MODEL],
      });
    });
  });

  test.describe("filtering", () => {
    test("should filter entities by type", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.filterButton(page).click();
      await popover(page).getByText("Table", { exact: true }).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await popover(page).getByText("Model", { exact: true }).click();

      // only tables
      await popover(page).getByText("Table", { exact: true }).click();
      await checkList(page, {
        visibleEntities: BROKEN_TABLE_DEPENDENCIES,
        hiddenEntities: [
          ...BROKEN_QUESTION_DEPENDENCIES,
          ...BROKEN_MODEL_DEPENDENCIES,
        ],
      });

      // only questions
      await popover(page).getByText("Table", { exact: true }).click();
      await popover(page).getByText("Question", { exact: true }).click();
      await checkList(page, {
        visibleEntities: BROKEN_QUESTION_DEPENDENCIES,
        hiddenEntities: [
          ...BROKEN_TABLE_DEPENDENCIES,
          ...BROKEN_MODEL_DEPENDENCIES,
        ],
      });

      // only models
      await popover(page).getByText("Question", { exact: true }).click();
      await popover(page).getByText("Model", { exact: true }).click();
      await checkList(page, {
        visibleEntities: BROKEN_MODEL_DEPENDENCIES,
        hiddenEntities: [
          ...BROKEN_TABLE_DEPENDENCIES,
          ...BROKEN_QUESTION_DEPENDENCIES,
        ],
      });
    });

    test("should filter entities by location", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.filterButton(page).click();
      await popover(page)
        .getByText("Include items in personal collections", { exact: true })
        .click();
      await checkList(page, {
        visibleEntities: [
          ...BROKEN_TABLE_DEPENDENCIES,
          ...BROKEN_MODEL_DEPENDENCIES,
        ],
        hiddenEntities: BROKEN_QUESTION_DEPENDENCIES,
      });
    });
  });

  test.describe("sorting", () => {
    test("should sort by name", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially("test");

      // sorted by name by default
      await checkListSorting(page, {
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
      });

      // sorted by name ascending
      await DependencyDiagnostics.list(page)
        .getByText("Dependency", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
      });

      // sorted by name descending
      await DependencyDiagnostics.list(page)
        .getByText("Dependency", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_NAME].reverse(),
      });
    });

    test("should sort by location", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially("test");

      // sorted by location ascending
      await DependencyDiagnostics.list(page)
        .getByText("Location", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_LOCATION,
      });

      // sorted by location descending
      await DependencyDiagnostics.list(page)
        .getByText("Location", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_LOCATION].reverse(),
      });
    });

    test("should sort by dependents errors", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially("test");

      // sorted by dependents errors ascending
      await DependencyDiagnostics.list(page)
        .getByText("Problems", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: [
          ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
        ].reverse(),
      });

      // sorted by dependents errors descending
      await DependencyDiagnostics.list(page)
        .getByText("Problems", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
      });
    });

    test("should sort by dependents with errors", async ({ page }) => {
      await visitBrokenDependencies(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially("test");

      // sorted by dependents with errors ascending
      await DependencyDiagnostics.list(page)
        .getByText("Broken dependents", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: [
          ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
        ].reverse(),
      });

      // sorted by dependents with errors descending
      await DependencyDiagnostics.list(page)
        .getByText("Broken dependents", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
      });
    });
  });
});

// === fixture setup (ports of the spec-local create*/break* helpers) ===

async function createContent(api: MetabaseApi) {
  await createTransformFixture(api);
  await createTableContent(api);
  await createQuestionContent(api);
  await createModelContent(api);
  await breakTransform(api);
  await waitForBreakingDependenciesFixture(api);
}

async function createTransformFixture(api: MetabaseApi) {
  const transform = await createTransform(api, {
    name: TABLE_TRANSFORM,
    source: {
      type: "query",
      query: {
        type: "native",
        database: WRITABLE_DB_ID,
        native: {
          query: "SELECT 1 as score, 'active' as status",
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: TABLE_NAME,
    },
  });
  transformId = transform.id;

  await runTransform(api, transform.id);
  await resyncDatabase(api, { dbId: WRITABLE_DB_ID, tables: [TABLE_NAME] });
  await waitForTransformRuns(
    api,
    (runs) =>
      runs.length === 1 && runs.every((run) => run.status === "succeeded"),
  );
}

async function breakTransform(api: MetabaseApi) {
  if (transformId == null) {
    throw new Error("transformId was never set");
  }
  await api.put(`/api/transform/${transformId}`, {
    source: {
      type: "query",
      query: {
        type: "native",
        database: WRITABLE_DB_ID,
        native: {
          query: "SELECT 1 as score_new, 'active' as status_new",
        },
      },
    },
  });
  await runTransform(api, transformId);
  await waitForTransformRuns(
    api,
    (runs) =>
      runs.length === 2 && runs.every((run) => run.status === "succeeded"),
  );
}

async function createTableContent(api: MetabaseApi) {
  const tableId = await getTableId(api, { name: TABLE_NAME });
  const scoreFieldId = await getFieldId(api, { tableId, name: "score" });
  const statusFieldId = await getFieldId(api, { tableId, name: "status" });

  await createQuestion(api, {
    name: TABLE_BASED_QUESTION_BROKEN_FIELD,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      fields: [["field", statusFieldId, null]],
    },
  });

  await createQuestion(api, {
    name: TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      expressions: {
        Expression: ["+", ["field", scoreFieldId, null], 0],
      },
    },
  });

  await createQuestion(api, {
    name: TABLE_BASED_QUESTION_BROKEN_FILTER,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      filter: ["=", ["field", scoreFieldId, null], 0],
    },
  });

  await createQuestion(api, {
    name: TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      breakout: [["field", scoreFieldId, null]],
    },
  });

  await createQuestion(api, {
    name: TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["avg", ["field", scoreFieldId, null]]],
    },
  });

  await createQuestion(api, {
    name: TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      joins: [
        {
          "source-table": tableId,
          alias: TABLE_DISPLAY_NAME,
          condition: [
            "=",
            ["field", statusFieldId, null],
            ["field", statusFieldId, { "join-alias": TABLE_DISPLAY_NAME }],
          ],
        },
      ],
      aggregation: [
        ["max", ["field", scoreFieldId, { "join-alias": TABLE_DISPLAY_NAME }]],
      ],
    },
  });
}

async function createQuestionContent(api: MetabaseApi) {
  const tableId = await getTableId(api, { name: TABLE_NAME });
  const card = await createQuestion(api, {
    name: TABLE_BASED_QUESTION,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
    },
    collection_id: ADMIN_PERSONAL_COLLECTION_ID,
  });
  await createQuestion(api, {
    name: QUESTION_BASED_QUESTION_BROKEN_FILTER,
    query: {
      "source-table": `card__${card.id}`,
      filter: [">", ["field", "PRICE", { "base-type": "type/Float" }], 10],
    },
  });
}

async function createModelContent(api: MetabaseApi) {
  const tableId = await getTableId(api, { name: TABLE_NAME });
  const card = await createQuestion(api, {
    name: TABLE_BASED_MODEL,
    type: "model",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
    },
  });
  await createQuestion(api, {
    name: MODEL_BASED_MODEL_BROKEN_AGGREGATION,
    type: "model",
    query: {
      "source-table": `card__${card.id}`,
      aggregation: [
        ["distinct", ["field", "AMOUNT", { "base-type": "type/Integer" }]],
      ],
    },
  });
}

async function waitForBreakingDependenciesFixture(api: MetabaseApi) {
  await waitForBreakingDependencies(
    api,
    (nodes) => nodes.length >= BROKEN_DEPENDENCIES.length,
  );
}

// === assertions (ports of the spec-local check* helpers) ===

async function checkList(
  page: Page,
  {
    visibleEntities = [],
    hiddenEntities = [],
  }: { visibleEntities?: string[]; hiddenEntities?: string[] },
) {
  const list = DependencyDiagnostics.list(page);
  for (const name of visibleEntities) {
    // Upstream asserts `should("exist")`; the list is virtualized, so scroll
    // the row into view before asserting it rendered.
    const item = list.getByText(name, { exact: true });
    await item.scrollIntoViewIfNeeded();
    await expect(item).toBeVisible();
  }
  for (const name of hiddenEntities) {
    await expect(list.getByText(name, { exact: true })).toHaveCount(0);
  }
}

async function checkSidebar(
  page: Page,
  {
    title,
    transform,
    missingColumns,
    brokenDependents,
  }: {
    title: string;
    transform?: string;
    missingColumns?: string[];
    brokenDependents?: string[];
  },
) {
  const sidebar = DependencyDiagnostics.sidebar(page);
  await expect(sidebar).toBeVisible();

  await expect(
    DependencyDiagnostics.Sidebar.header(page).getByText(title, {
      exact: true,
    }),
  ).toBeVisible();

  if (transform) {
    await expect(
      DependencyDiagnostics.Sidebar.infoSection(page).getByText(transform, {
        exact: true,
      }),
    ).toHaveCount(1);
  }

  if (missingColumns) {
    const section = BrokenSidebar.missingColumnsSection(page);
    for (const column of missingColumns) {
      const columnText = section.getByText(column, { exact: true });
      await columnText.scrollIntoViewIfNeeded();
      await expect(columnText).toBeVisible();
    }
  }

  if (brokenDependents) {
    const section = BrokenSidebar.brokenDependentsSection(page);
    for (const dependent of brokenDependents) {
      const dependentText = section.getByText(dependent, { exact: true });
      await dependentText.scrollIntoViewIfNeeded();
      await expect(dependentText).toBeVisible();
    }
  }
}

async function checkListSorting(
  page: Page,
  { visibleEntities }: { visibleEntities: string[] },
) {
  const list = DependencyDiagnostics.list(page);
  for (let index = 0; index < visibleEntities.length; index++) {
    const name = visibleEntities[index];
    // Port of `cy.findByText(name).parents("[data-index]")` — the virtualized
    // row wrapper carrying the position. Build the `has` text locator from
    // `page`, never from `list` (PORTING: a Locator-scoped `has` gets
    // re-anchored to the outer scope and never resolves).
    const row = list
      .locator("[data-index]")
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toHaveAttribute("data-index", index.toString());
  }
}
