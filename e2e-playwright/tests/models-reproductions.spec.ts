/**
 * Playwright port of e2e/test/scenarios/models/reproductions.cy.spec.js
 *
 * A grab-bag of model bug reproductions; every issue number is preserved.
 *
 * Porting notes:
 * - Cypress `@dataset` / `@updateField` / `@updateModel` intercepts become
 *   waitForResponse promises registered before the triggering action (rule 2).
 * - `H.createQuestion` / `H.createNativeQuestion` with `visitQuestion: true`:
 *   models redirect /question/:id → /model/:id and run /api/dataset, so those
 *   blocks create via the API then `visitModel`; plain questions use
 *   `visitQuestion`.
 * - `H.openQuestionActions(); H.popover().findByText("Edit metadata")` uses the
 *   role-based `openQuestionActionsItem` (models-reproductions-2) because the
 *   app appends a completeness badge ("Edit metadata 33%") that a Playwright
 *   exact getByText never hits (testing-library matched the label's own text
 *   node, so Cypress worked).
 * - `cy.go("back")` → page.goBack(); retried `cy.location` → expect.poll.
 * - issue 22519 is upstream `{ tags: "@skip" }` → test.describe.skip (ported
 *   faithfully but never runs).
 * - Module-level spec helpers (mapModelColumnToDatabase / selectModelColumn)
 *   live in support/models-reproductions.ts; describe-scoped closures stay
 *   inline as in the original.
 */
import { createAction } from "../support/actions-on-dashboards";
import { commandPaletteSearch } from "../support/dashboard-questions";
import {
  editDashboard,
  getDashboardCard,
  pickEntity,
  setFilter,
} from "../support/dashboard";
import type { Page } from "@playwright/test";

import { addOrUpdateDashboardCard } from "../support/drillthroughs";
import { SAMPLE_DB_SCHEMA_ID, visitDataModel } from "../support/data-model";
import {
  createDashboard,
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { editDashboardCard, setModelMetadata } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { miniPickerBrowseAll } from "../support/joins";
import { cartesianChartCircles } from "../support/metrics";
import { turnIntoModel as turnQuestionIntoModel } from "../support/models-core";
import {
  mapModelColumnToDatabase,
  selectModelColumn,
} from "../support/models-reproductions";
import { openQuestionActionsItem } from "../support/models-reproductions-2";
import {
  openQuestionActions,
  visitModel,
  waitForDataset,
} from "../support/models";
import { nativeEditor } from "../support/native-editor";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  entityPickerModalLevel,
  miniPicker,
  startNewQuestion,
  tableHeaderClick,
} from "../support/notebook";
import { assertTableData } from "../support/multiple-column-breakouts";
import { rightSidebar } from "../support/question-saved";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { tableInteractiveHeader } from "../support/table-column-settings";
import {
  closeCommandPalette,
  commandPalette,
  setActionsEnabledForDB,
} from "../support/command-palette";
import {
  icon,
  modal,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID, REVIEWS_ID, PRODUCTS } = SAMPLE_DATABASE;
// Upstream destructures the field-id objects; `REVIEWS.REVIEWS` (used only in
// the @skip'd issue 22519) is not a real key, so cast to keep tsc happy while
// porting the reference faithfully.
const REVIEWS = SAMPLE_DATABASE.REVIEWS as Record<string, number>;

test.describe("issue 19737", () => {
  const modelName = "Orders Model";
  const personalCollectionName = "Bobby Tables's Personal Collection";

  async function openEllipsisMenuFor(
    page: Page,
    item: string,
  ) {
    await page
      .getByText(item, { exact: true })
      .locator("xpath=ancestor::tr[1]")
      .locator(".Icon-ellipsis")
      .click();
  }

  async function moveModel(
    page: Page,
    model: string,
    collectionName: string | string[],
  ) {
    await openEllipsisMenuFor(page, model);
    await popover(page).getByText("Move", { exact: true }).click();

    await pickEntity(page, {
      path: Array.isArray(collectionName) ? collectionName : [collectionName],
    });

    await entityPickerModal(page)
      .getByRole("button", { name: "Move", exact: true })
      .click();
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show moved model in the data picker without refreshing (metabase#19737)", async ({
    page,
  }) => {
    await page.goto("/collection/root");

    await moveModel(page, modelName, personalCollectionName);

    await expect(page.getByText("Moved model").first()).toBeVisible();

    await page
      .getByLabel("Navigation bar")
      .getByText("New", { exact: true })
      .click();
    await page
      .getByText("Question", { exact: true })
      .filter({ visible: true })
      .first()
      .click();

    await miniPickerBrowseAll(page).click();
    await entityPickerModal(page)
      .getByText(personalCollectionName, { exact: true })
      .click();
    await expect(
      entityPickerModal(page).getByText(modelName, { exact: true }),
    ).toBeVisible();
  });

  test("should not show duplicate models in the data picker after it's moved from a custom collection without refreshing (metabase#19737)", async ({
    page,
  }) => {
    // move "Orders Model" to "First collection"
    await page.goto("/collection/root");

    await moveModel(page, modelName, ["Our analytics", "First collection"]);

    await expect(page.getByText("Moved model").first()).toBeVisible();
    // Close the modal so the next time we move the model another model will
    // always be shown
    await icon(page, "close").filter({ visible: true }).first().click();

    await page
      .getByLabel("Navigation bar")
      .getByText("New", { exact: true })
      .click();
    await page
      .getByText("Question", { exact: true })
      .filter({ visible: true })
      .first()
      .click();

    // Open question picker (this is crucial) so the collection list are loaded.
    await miniPickerBrowseAll(page).click();
    await entityPickerModal(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByText("First collection", { exact: true })
      .click();
    await expect(
      entityPickerModal(page).getByText(modelName, { exact: true }),
    ).toBeVisible();

    // Use back button to so the state is kept
    await page.goBack();

    // move "Orders Model" from a custom collection ("First collection") to
    // another collection
    await openNavigationSidebar(page);
    await navigationSidebar(page)
      .getByText("First collection", { exact: true })
      .click();

    await moveModel(page, modelName, personalCollectionName);

    await expect(page.getByText("Moved model").first()).toBeVisible();

    await page
      .getByLabel("Navigation bar")
      .getByText("New", { exact: true })
      .click();
    await page
      .getByText("Question", { exact: true })
      .filter({ visible: true })
      .first()
      .click();

    await miniPickerBrowseAll(page).click();
    await expect(
      entityPickerModal(page).getByText("First collection", { exact: true }),
    ).toHaveCount(0);
    await expect(entityPickerModalLevel(page, 1)).toBeAttached();
    await expect(entityPickerModalLevel(page, 2)).toHaveCount(0);
  });
});

test.describe.skip("issue 22519", () => {
  const questionDetails = {
    query: {
      "source-table": REVIEWS_ID,
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const updateField = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/field\/\d+$/.test(new URL(response.url()).pathname),
    );

    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: REVIEWS_ID,
      fieldId: REVIEWS.REVIEWS,
    });

    await page.getByText("Don't cast", { exact: true }).click();
    await page.getByText("UNIX seconds → Datetime", { exact: true }).click();
    await updateField;
  });

  test("model query should not fail when data model is using casting (metabase#22519)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    await expect(page.getByText("xavier").first()).toBeVisible();

    const dataset = waitForDataset(page);
    await turnQuestionIntoModel(page);
    await dataset;

    await expect(page.getByText("xavier").first()).toBeVisible();
  });
});

test.describe("issue 23024", () => {
  const query = `select *
                  from products limit 5`;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id: modelId } = await createNativeQuestion(mb.api, {
      native: { query },
      type: "model",
    });

    await setModelMetadata(mb.api, modelId, (field) => {
      if (field.display_name === "CATEGORY") {
        return {
          ...field,
          id: PRODUCTS.CATEGORY,
          display_name: "Category",
          semantic_type: "type/Category",
        };
      }
      return field;
    });

    const { id: dashboardId } = await createDashboard(mb.api);
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashboardId,
      card_id: modelId,
    });
    await visitDashboard(page, mb.api, dashboardId);
  });

  test("should not be possible to apply the dashboard filter to the native model (metabase#23024)", async ({
    page,
  }) => {
    await editDashboard(page);

    await setFilter(page, "Text or Category", "Is");

    const card = getDashboardCard(page);
    await expect(card.getByText(/Models are data sources/)).toBeVisible();
    await expect(card.getByText("Select…", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 23421", () => {
  const query =
    'SELECT 1 AS "id", current_timestamp::timestamp AS "created_at"';

  const emptyColumnsQuestionDetails = {
    native: { query },
    displayIsLocked: true,
    visualization_settings: {
      "table.columns": [],
      "table.pivot_column": "orphaned1",
      "table.cell_column": "orphaned2",
    },
    type: "model",
  };

  const hiddenColumnsModelDetails = {
    native: { query },
    displayIsLocked: true,
    visualization_settings: {
      "table.columns": [
        {
          name: "id",
          key: '["name","id"]',
          enabled: false,
          fieldRef: ["field", "id", { "base-type": "type/Integer" }],
        },
        {
          name: "created_at",
          key: '["name","created_at"]',
          enabled: false,
          fieldRef: ["field", "created_at", { "base-type": "type/DateTime" }],
        },
      ],
      "table.pivot_column": "orphaned1",
      "table.cell_column": "orphaned2",
    },
    type: "model",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("`visualization_settings` should not break UI (metabase#23421)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, emptyColumnsQuestionDetails);
    await visitModel(page, id);
    await openQuestionActions(page, "Edit query definition");

    await expect(nativeEditor(page)).toBeVisible();
    await expect(nativeEditor(page)).toContainText(query);
    await expect(
      page.getByRole("columnheader", { name: "id", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "created_at", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeVisible();
  });

  test("`visualization_settings` with hidden columns should not break UI (metabase#23421)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, hiddenColumnsModelDetails);
    await visitModel(page, id);
    await openQuestionActions(page, "Edit query definition");

    await expect(nativeEditor(page)).toBeVisible();
    await expect(nativeEditor(page)).toContainText(query);
    const header = tableInteractiveHeader(page);
    await expect(header.getByText("id", { exact: true })).toBeVisible();
    await expect(header.getByText("created_at", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
  });
});

test.describe("issue 23449", () => {
  const questionDetails = { query: { "source-table": REVIEWS_ID, limit: 2 } };

  async function turnIntoModel(page: Page) {
    const cardUpdate = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );

    await openQuestionActions(page);
    await popover(page).getByText("Turn into a model", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Turn this into a model", exact: true })
      .click();

    const response = await cardUpdate;
    const body = (await response.json()) as { error?: unknown };
    expect(body.error).toBeUndefined();
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.post(`/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });

    await mb.api.post(`/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "Awful"],
        [2, "Unpleasant"],
        [3, "Meh"],
        [4, "Enjoyable"],
        [5, "Perfecto"],
      ],
    });
  });

  test("should work with the remapped custom values from data model (metabase#23449)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);
    await expect(page.getByText("Perfecto").first()).toBeVisible();

    await turnIntoModel(page);
    await expect(page.getByText("Perfecto").first()).toBeVisible();
  });
});

test.describe("issue 25537", () => {
  const questionDetails = {
    name: "Orders model",
    query: { "source-table": ORDERS_ID },
    type: "model",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to pick a saved model when using a non-english locale (metabase#25537)", async ({
    page,
    mb,
  }) => {
    const current = (await (
      await mb.api.get("/api/user/current")
    ).json()) as { id: number };
    await mb.api.put(`/api/user/${current.id}`, { locale: "en-ZZ" });

    await createQuestion(mb.api, questionDetails);

    await startNewQuestion(page);
    const picker = miniPicker(page);
    await picker.getByText("[zz] Our analytics", { exact: true }).click();
    await expect(
      picker.getByText(questionDetails.name, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 29378", () => {
  const ACTION_DETAILS = {
    name: "Update orders quantity",
    description: "Set orders quantity to the same value",
    type: "query",
    model_id: ORDERS_QUESTION_ID,
    database_id: SAMPLE_DB_ID,
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: "UPDATE orders SET quantity = quantity",
      },
      type: "native",
    },
    parameters: [],
    visualization_settings: {
      type: "button",
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);
  });

  test("should not crash the model detail page after searching for an action (metabase#29378)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    await createAction(mb.api, ACTION_DETAILS);

    await page.goto(`/model/${ORDERS_QUESTION_ID}/detail`);
    await expect(page.getByText(ACTION_DETAILS.name).first()).toBeVisible();
    await expect(
      page.getByText(ACTION_DETAILS.dataset_query.native.query).first(),
    ).toBeVisible();

    await commandPaletteSearch(page, ACTION_DETAILS.name, false);
    await expect(
      commandPalette(page).getByRole("option", {
        name: ACTION_DETAILS.name,
        exact: true,
      }),
    ).toBeVisible();
    await closeCommandPalette(page);

    await expect(page.getByText(ACTION_DETAILS.name).first()).toBeVisible();
    await expect(
      page.getByText(ACTION_DETAILS.dataset_query.native.query).first(),
    ).toBeVisible();
  });
});

/** GET /api/database/1/schema/PUBLIC?can-query=true — the `@schema` alias. */
function waitForSchema(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname ===
        `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC` &&
      response.url().includes("can-query=true"),
  );
}

function waitForCardPut(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
}

test.describe("issue 29517 - nested question based on native model with remapped values", () => {
  const questionDetails = {
    name: "29517",
    type: "model",
    native: {
      query:
        'Select Orders."ID" AS "ID",\nOrders."CREATED_AT" AS "CREATED_AT"\nFrom Orders',
      "template-tags": {},
    },
  };

  let dashboardId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, questionDetails);

    const schema = waitForSchema(page);
    await page.goto(`/model/${id}/columns`);
    await schema;

    await mapModelColumnToDatabase(page, { table: "Orders", field: "ID" });
    await selectModelColumn(page, "CREATED_AT");
    await mapModelColumnToDatabase(page, {
      table: "Orders",
      field: "Created At",
    });

    const updateModel = waitForCardPut(page);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await updateModel;

    const nestedQuestionDetails = {
      query: {
        "source-table": `card__${id}`,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            "CREATED_AT",
            { "temporal-unit": "month", "base-type": "type/DateTime" },
          ],
        ],
      },
      display: "line",
    };

    const card = await createQuestionAndDashboard(mb.api, {
      questionDetails: nestedQuestionDetails,
    });

    await editDashboardCard(mb.api, card, {
      visualization_settings: {
        click_behavior: {
          type: "link",
          linkType: "dashboard",
          targetId: ORDERS_DASHBOARD_ID,
          parameterMapping: {},
        },
      },
    });

    dashboardId = card.dashboard_id;
  });

  test("click behavior to custom destination should work (metabase#29517-2)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, dashboardId);

    const loadTargetDashboard = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname ===
          `/api/dashboard/${ORDERS_DASHBOARD_ID}`,
    );
    const dashcardQuery = page.waitForResponse((response) =>
      /\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query/.test(
        new URL(response.url()).pathname,
      ),
    );

    await cartesianChartCircles(page).nth(25).click({ force: true });
    await loadTargetDashboard;

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/dashboard/${ORDERS_DASHBOARD_ID}`);

    await dashcardQuery;

    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
  });
});

test.describe("issue 53556 - nested question based on native model with remapped values", () => {
  const questionDetails = {
    name: "53556",
    type: "model",
    native: {
      query:
        "Select " +
        'Orders."ID" AS "ID", ' +
        'Orders."CREATED_AT" AS "CREATED_AT_ALIAS", ' +
        'Orders."TOTAL" AS "TOTAL_ALIAS" ' +
        "From Orders",
      "template-tags": {},
    },
  };

  let nestedQuestionId: number;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, questionDetails);

    const schema = waitForSchema(page);
    await page.goto(`/model/${id}/columns`);
    await schema;

    await mapModelColumnToDatabase(page, { table: "Orders", field: "ID" });
    await selectModelColumn(page, "CREATED_AT_ALIAS");
    await mapModelColumnToDatabase(page, {
      table: "Orders",
      field: "Created At",
    });
    await selectModelColumn(page, "TOTAL_ALIAS");
    await mapModelColumnToDatabase(page, { table: "Orders", field: "Total" });

    const updateModel = waitForCardPut(page);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await updateModel;

    const nestedQuestionDetails = {
      query: {
        "source-table": `card__${id}`,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            "CREATED_AT_ALIAS",
            { "temporal-unit": "month", "base-type": "type/DateTime" },
          ],
          [
            "field",
            "TOTAL_ALIAS",
            { binning: { strategy: "default" }, "base-type": "type/Float" },
          ],
        ],
      },
      display: "line",
    };

    const nested = await createQuestion(mb.api, nestedQuestionDetails);
    nestedQuestionId = nested.id;
  });

  test("Sort drill-through should work (metabase#53556)", async ({
    page,
  }) => {
    await visitQuestion(page, nestedQuestionId);

    // The footer toggle SVG reads as "not enabled" to Playwright's
    // actionability (established pattern across specs) — force the click.
    await page
      .getByLabel("Switch to data", { exact: true })
      .click({ force: true });
    await assertQueryBuilderRowCount(page, 312);

    // Sort by Total in descending order
    let dataset = waitForDataset(page);
    await tableHeaderClick(page, "Total: 8 bins");
    await popover(page)
      .getByTestId("click-actions-sort-control-sort.descending")
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 312);
    await assertTableData(page, {
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["January 2027", "140  –  160", "18"],
        ["February 2027", "140  –  160", "17"],
      ],
    });

    // Sort by Total in ascending order
    dataset = waitForDataset(page);
    await tableHeaderClick(page, "Total: 8 bins");
    await popover(page)
      .getByTestId("click-actions-sort-control-sort.ascending")
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 312);
    await assertTableData(page, {
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["December 2026", "-60  –  -40", "1"],
        ["September 2025", "0  –  20", "2"],
      ],
    });

    // Sort by Created At in descending order
    dataset = waitForDataset(page);
    await tableHeaderClick(page, "Created At: Month");
    await popover(page)
      .getByTestId("click-actions-sort-control-sort.descending")
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 312);
    await assertTableData(page, {
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["April 2029", "20  –  40", "27"],
        ["April 2029", "40  –  60", "57"],
      ],
    });

    // Sort by Created At in ascending order
    dataset = waitForDataset(page);
    await tableHeaderClick(page, "Created At: Month");
    await popover(page)
      .getByTestId("click-actions-sort-control-sort.ascending")
      .click();
    await dataset;
    await assertQueryBuilderRowCount(page, 312);
    await assertTableData(page, {
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["April 2025", "40  –  60", "1"],
        ["May 2025", "20  –  40", "1"],
      ],
    });
  });
});

test.describe("issue 40252", () => {
  const modelA = {
    name: "Model A",
    native: { query: "select 1 as a1, 2 as a2" },
    type: "model",
  };

  const modelB = {
    name: "Model B",
    native: { query: "select 1 as b1, 2 as b2" },
    type: "model",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shouldn't crash during save of metadata (metabase#40252)", async ({
    page,
    mb,
  }) => {
    const { id: modelAId } = await createNativeQuestion(mb.api, modelA);
    const { id: modelBId } = await createNativeQuestion(mb.api, modelB);

    const questionDetails = {
      name: "40252",
      type: "model",
      query: {
        joins: [
          {
            fields: "all",
            alias: "Model B - A1",
            strategy: "inner-join",
            condition: [
              "=",
              ["field", "A1", { "base-type": "type/Integer" }],
              [
                "field",
                "B1",
                { "base-type": "type/Integer", "join-alias": "Model B - A1" },
              ],
            ],
            "source-table": `card__${modelBId}`,
          },
        ],
        "source-table": `card__${modelAId}`,
      },
    };

    const model = await createQuestion(mb.api, questionDetails);
    await visitModel(page, model.id);

    await openQuestionActionsItem(page, /Edit metadata/);

    await page
      .getByTestId("header-cell")
      .filter({ hasText: "Model B - A1 → B1" })
      .first()
      .click();

    const displayName = page.getByLabel("Display name");
    await displayName.click();
    await displayName.press("End");
    await displayName.pressSequentially("Upd");

    // Because the field is debounced, we wait to see it in the metadata editor
    // table before saving
    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: "Model B - A1 → B1Upd" })
        .first(),
    ).toBeVisible();

    const dataset = waitForDataset(page);
    const saveButton = page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Save changes", exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page).not.toHaveURL(/\/columns/);

    await dataset;

    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: "Model B - A1 → B1Upd" })
        .first(),
    ).toBeVisible();
  });
});

test.describe("issue 42355", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow overriding database fields for models with manually ordered columns (metabase#42355)", async ({
    page,
    mb,
  }) => {
    const card = await createNativeQuestion(mb.api, {
      type: "model",
      native: { query: "SELECT ID, PRODUCT_ID FROM ORDERS" },
      visualization_settings: {
        "table.columns": [
          {
            name: "PRODUCT_ID",
            key: '["name","PRODUCT_ID"]',
            enabled: true,
            fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
          },
          {
            name: "ID",
            key: '["name","ID"]',
            enabled: true,
            fieldRef: ["field", "ID", { "base-type": "type/BigInteger" }],
          },
        ],
        "table.cell_column": "ID",
      },
    });
    await visitModel(page, card.id);

    // update metadata
    await openQuestionActionsItem(page, /Edit metadata/);
    await rightSidebar(page)
      .getByText("Database column this maps to", { exact: true })
      .locator("xpath=following-sibling::*[1]")
      .getByText("None", { exact: true })
      .click();
    await popover(page).getByText("Orders", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();

    // check metadata changes are visible
    await openQuestionActionsItem(page, /Edit metadata/);
    await expect(
      rightSidebar(page)
        .getByText("Database column this maps to", { exact: true })
        .locator("xpath=following-sibling::*[1]")
        .getByText("Orders → ID", { exact: true }),
    ).toBeVisible();
  });
});
