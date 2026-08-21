/**
 * Playwright port of e2e/test/scenarios/models/reproductions-3.cy.spec.ts
 *
 * A grab-bag of model bug reproductions; every issue number is preserved.
 *
 * Porting notes:
 * - Cypress `@dataset` / `@cardQuery` / `@query` / `@updateCard` /
 *   `@updateMetadata` / `@createModel` / `@saveCard` intercepts become
 *   waitForResponse promises registered before the triggering action
 *   (waitForDataset / waitForCardUpdate / inline POST-card waits). Never-awaited
 *   intercepts (`@idFields` is awaited; `@card` is COUNTED — see below) are
 *   handled per rule 2.
 * - `H.createNativeQuestion({ ..., type: "model" })` / `H.createQuestion({
 *   type: "model" })` create the model via the API; then `visitModel` (waits
 *   /api/dataset) or `visitModelNoDataAccess` (waits /api/card/:id/query for a
 *   viewer without data perms).
 * - "Edit metadata" in the question-actions menu carries a completeness badge
 *   ("Edit metadata 33%"), so it's clicked via openQuestionActionsItem's
 *   role+regex matcher, never an exact getByText (issue 31663).
 * - `cy.location(...)` retried assertions → expect(page).toHaveURL(predicate).
 * - `H.moveDnDKitElementByAlias(alias, { horizontal })` → moveDnDKitElement
 *   (real-mouse) from support/dashboard-cards.ts.
 * - `.should("be.visible")` / `.and("contain", …)` on a multi-match set are
 *   ANY-of assertions → filter / .first() (rule 3).
 * - issue 20624 is `{ tags: "@skip" }` at the describe level and issue 22517's
 *   `it` is `{ tags: "@skip" }` — ported as faithful test.skip.
 * - Spec-local counter (countCardRequests) lives in
 *   support/models-reproductions-3.ts.
 */
import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";

import { moveDnDKitElement } from "../support/dashboard-cards";
import { openVizTypeSidebar } from "../support/charts-extras";
import { leftSidebar } from "../support/charts";
import { removeNotebookClauseByText } from "../support/custom-column-1";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { filterSimple } from "../support/filter";
import { findByDisplayValue } from "../support/filters-repros";
import {
  openQuestionActions,
  summarize,
  tableInteractive,
  visitModel,
  waitForDataset,
} from "../support/models";
import { waitForCardUpdate } from "../support/models-core";
import { countCardRequests } from "../support/models-reproductions-3";
import {
  datasetEditBar,
  openQuestionActionsItem,
  saveMetadataChanges,
  startNewModel,
  startNewNativeModel,
  visitModelNoDataAccess,
  waitForLoaderToBeRemoved,
} from "../support/models-reproductions-2";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  tableHeaderColumn,
  viewFooter,
  visualize,
} from "../support/notebook";
import {
  focusNativeEditor,
  typeInNativeEditor,
} from "../support/native-editor";
import { rightSidebar } from "../support/question-saved";
import { saveQuestion } from "../support/sharing";
import { turnIntoModel } from "../support/models-core";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { icon, main, modal, popover } from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

function saveChangesButton(scope: Page | import("@playwright/test").Locator) {
  return scope.getByRole("button", { name: "Save changes", exact: true });
}

test.describe("issue 19180", () => {
  const QUESTION = {
    native: { query: "select * from products" },
    type: "model" as const,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shouldn't drop native model query results after leaving the query editor", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, QUESTION);

    // The query-editor page runs the card via /api/card/:id/query.
    const cardQuery = page.waitForResponse((response) =>
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
    );
    await page.goto(`/model/${id}/query`);
    await cardQuery;

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(tableInteractive(page)).toBeVisible();
    await expect(
      page.getByText("Here's where your results will appear", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 20042", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });

    await mb.signIn("nodata");
  });

  test("nodata user should not see the blank screen when visiting model (metabase#20042)", async ({
    page,
  }) => {
    await visitModelNoDataAccess(page, ORDERS_QUESTION_ID);

    await expect(
      page.getByText("Orders Model", { exact: true }).first(),
    ).toBeVisible();
    // cy.contains("37.65") — case-sensitive substring, first match.
    await expect(page.getByText("37.65").first()).toBeVisible();
  });
});

test.describe("issue 20045", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });
  });

  test("should not add query hash on the rerun (metabase#20045)", async ({
    page,
  }) => {
    await visitModel(page, ORDERS_QUESTION_ID);

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/model/${ORDERS_QUESTION_ID}-orders-model` &&
        url.hash === "",
    );

    const dataset = waitForDataset(page);
    // The header run/refresh button — scoped to the header panel, so only the
    // one instance matches (the run-button-overlay lives in the viz area).
    await icon(page.getByTestId("qb-header-action-panel"), "refresh")
      .first()
      .click();
    await dataset;

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/model/${ORDERS_QUESTION_ID}-orders-model` &&
        url.hash === "",
    );
  });
});

test.describe("issue 20624", () => {
  // Ported faithfully as skip — the upstream describe carries `{ tags: "@skip" }`.
  test.skip(true, "@skip upstream");

  const renamedColumn = "TITLE renamed";

  const questionDetails = {
    name: "20624",
    type: "model" as const,
    native: { query: "select * from PRODUCTS limit 2" },
    visualization_settings: {
      column_settings: { '["name","TITLE"]': { column_title: renamedColumn } },
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitModel(page, id);
  });

  test("models metadata should override previously defined column settings (metabase#20624)", async ({
    page,
  }) => {
    await page.getByTestId("saved-question-header-title").click();
    await page.getByText("Customize metadata", { exact: true }).click();

    // Open settings for this column
    await page.getByText(renamedColumn, { exact: true }).click();
    // Let's set a new name for it
    const input = await findByDisplayValue(page.locator("body"), renamedColumn);
    await input.fill("");
    await input.fill("Foo");
    await input.blur();

    const updateCard = waitForCardUpdate(page);
    await saveChangesButton(page).click();
    await updateCard;

    await expect(page.getByTestId("cell-data").filter({ hasText: "Foo" }).first()).toBeVisible();
  });
});

test.describe("issue 22517", () => {
  async function renameColumn(page: Page, column: string, newName: string) {
    const input = await findByDisplayValue(page.locator("body"), column);
    await input.fill("");
    await input.fill(newName);
    await input.blur();
  }

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createNativeQuestion(mb.api, {
      name: "22517",
      native: { query: "select * from orders" },
      type: "model",
    });
    await visitModel(page, id);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    await renameColumn(page, "ID", "Foo");

    const updateMetadata = waitForCardUpdate(page);
    await saveChangesButton(page).click();
    await updateMetadata;
  });

  // Ported faithfully as skip — the upstream `it` carries `{ tags: "@skip" }`.
  test.skip("adding or removing a column should not drop previously edited metadata (metabase#22517)", async ({
    page,
  }) => {
    await openQuestionActionsItem(page, /Edit query definition/);

    // Make sure previous metadata changes are reflected in the UI
    await expect(page.getByText("Foo", { exact: true }).first()).toBeVisible();

    // This will edit the original query and add the `SIZE` column
    await focusNativeEditor(page);
    for (let i = 0; i < " from orders".length; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    await page.keyboard.type(
      ", case when quantity > 4 then 'large' else 'small' end size ",
    );

    const dataset = waitForDataset(page);
    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    await dataset;

    await expect(page.getByText("Foo", { exact: true }).first()).toBeVisible();

    await page.getByText("Save changes", { exact: true }).click();

    await expect(page.getByText("Foo", { exact: true }).first()).toBeVisible();
  });
});

test.describe("issue 22518", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await createNativeQuestion(mb.api, {
      native: { query: "select 1 id, 'a' foo" },
      type: "model",
    });
    await visitModel(page, id);
  });

  test("UI should immediately reflect model query changes upon saving (metabase#22518)", async ({
    page,
  }) => {
    await openQuestionActions(page, "Edit query definition");

    await typeInNativeEditor(page, ", 'b' bar");
    const dataset = waitForDataset(page);
    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    await dataset;

    await datasetEditBar(page)
      .getByRole("button", { name: "Save changes", exact: true })
      .click();

    const headerCells = page.getByTestId("header-cell");
    await expect(headerCells).toHaveCount(3);
    await expect(
      headerCells.filter({ hasText: "BAR" }).first(),
    ).toBeVisible();

    await summarize(page);

    // H.sidebar() ("main aside") matches both asides and its
    // .should("contain", …) is an any-of over the set (case-sensitive
    // substring) — assert each column appears in SOME aside (rule 3).
    for (const column of ["ID", "FOO", "BAR"]) {
      await expect(
        main(page)
          .locator("aside")
          .filter({ hasText: new RegExp(column) })
          .first(),
      ).toBeVisible();
    }
  });
});

test.describe("issue 26091", () => {
  const modelDetails = {
    name: "Old model",
    query: { "source-table": PRODUCTS_ID },
    type: "model" as const,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow to choose a newly created model in the data picker (metabase#26091)", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, modelDetails);

    await startNewQuestion(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    await saveQuestion(page, "New model", { path: ["Our analytics"] });
    await turnIntoModel(page);

    await startNewQuestion(page);
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await expect(
      miniPicker(page).getByText("New model", { exact: true }),
    ).toBeVisible();
    await expect(
      miniPicker(page).getByText("Old model", { exact: true }),
    ).toBeVisible();
    await expect(
      miniPicker(page).getByText("Orders Model", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 28193", () => {
  const ccName = "CTax";

  async function assertOnColumns(page: Page) {
    const cells = page.getByText("2.07", { exact: true });
    await expect(cells).toHaveCount(2);
    await expect(cells.first()).toBeVisible();
    await expect(cells.last()).toBeVisible();
    // eslint-disable-next-line no-restricted-syntax -- last() mirrors upstream
    await expect(page.getByTestId("header-cell").last()).toHaveText(ccName);
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // Turn the question into a model
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
  });

  test("should be able to use custom column in a model query (metabase#28193)", async ({
    page,
  }) => {
    // Go directly to model's query definition
    await page.goto(`/model/${ORDERS_QUESTION_ID}/query`);

    await page.getByText("Custom column", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "[Tax]", name: ccName });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;

    await saveChangesButton(page).click();
    await expect(page).toHaveURL((url) => !url.pathname.includes("/query"));

    await assertOnColumns(page);

    const datasetReload = waitForDataset(page);
    await page.reload();
    await datasetReload;

    await assertOnColumns(page);
  });
});

test.describe("issue 28971", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to filter a newly created model (metabase#28971)", async ({
    page,
  }) => {
    await startNewModel(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;

    const createModel = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );
    await datasetEditBar(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await createModel;

    const filterDataset = waitForDataset(page);
    await filterSimple(page);
    await popover(page).getByText("Quantity", { exact: true }).click();
    await popover(page).getByText("20", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Apply filter" }).click();
    await filterDataset;

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Quantity is equal to 20",
    );
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 4 rows",
    );
  });
});

test.describe("issue 29951", () => {
  test.use({ viewport: { width: 1600, height: 800 } });

  const questionDetails = {
    name: "29951",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        CC1: ["+", ["field", ORDERS.TOTAL], 1],
        CC2: ["+", ["field", ORDERS.TOTAL], 1],
      },
      limit: 2,
    },
    type: "model" as const,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow to run the model query after changing custom columns (metabase#29951)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, questionDetails);
    await page.goto(`/model/${id}/query`);

    await removeNotebookClauseByText(getNotebookStep(page, "expression"), "CC2");
    // The UI shows us the "play" icon, indicating we should refresh the query,
    // but the point of this repro is to save without refreshing
    await expect(
      page.getByRole("button", { name: "Get Answer", exact: true }),
    ).toBeVisible();
    await saveMetadataChanges(page);

    // eslint-disable-next-line no-restricted-syntax -- last() mirrors upstream
    await expect(page.getByTestId("header-cell").last()).toHaveText("CC1");
    // The view-page table renders a hidden (visibility:hidden, off-screen)
    // measurement clone next to the real "ID" header cell, so scope to the
    // visible one (rule 3) and wait for it to lay out before the drag.
    const idHeader = tableHeaderColumn(page, "ID")
      .filter({ visible: true })
      .first();
    await expect(idHeader).toBeVisible();
    await moveDnDKitElement(idHeader, { horizontal: 100 });

    const dataset = waitForDataset(page);
    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: "Refresh", exact: true })
      .click();
    await dataset;
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
    await expect(viewFooter(page)).toContainText("Showing 2 rows");
  });
});

// Should be removed once proper model FK support is implemented
test.describe("issue 31663", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, {
      name: "Products Model",
      type: "model",
      query: { "source-table": PRODUCTS_ID },
    });
    await visitModel(page, id);
  });

  test("shouldn't list model IDs as possible model FK targets (metabase#31663)", async ({
    page,
  }) => {
    // It's important to have product model's metadata loaded to reproduce this
    await page
      .getByTestId("app-bar")
      .getByText("Our analytics", { exact: true })
      .click();

    const dataset = waitForDataset(page);
    await main(page).getByText("Orders Model", { exact: true }).click();
    await dataset;

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    const idFields = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname ===
          `/api/database/${SAMPLE_DB_ID}/idfields`,
    );
    await tableInteractive(page).getByText("Product ID", { exact: true }).click();
    await idFields;
    await page.getByPlaceholder("Select a target").click();

    await expect(
      popover(page).getByText("Orders Model → ID", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Products Model → ID", { exact: true }),
    ).toHaveCount(0);

    await expect(
      popover(page).getByText("Orders → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("People → ID", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Products → ID", { exact: true }),
    ).toBeVisible();

    const reviews = popover(page).getByText("Reviews → ID", { exact: true });
    await reviews.scrollIntoViewIfNeeded();
    await expect(reviews).toBeVisible();
  });
});

test.describe("issue 31905", () => {
  test("should not send more than one same api requests to load a model (metabase#31905)", async ({
    page,
    mb,
  }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const cardCount = countCardRequests(page);

    const { id } = await createQuestion(mb.api, {
      name: "Orders Model",
      type: "model",
      query: { "source-table": ORDERS_ID, limit: 2 },
    });
    await visitModel(page, id);

    // TODO: This should be 1, but MainNavbar.tsx RTKQ fetch + QB's call to
    // loadCard makes it 2
    await expect.poll(() => cardCount()).toBeLessThanOrEqual(2);
  });
});

test.describe("issue 32963", () => {
  async function assertLineChart(page: Page) {
    await openVizTypeSidebar(page);
    await expect(
      leftSidebar(page).getByTestId("Line-container"),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      leftSidebar(page).getByTestId("Table-container"),
    ).toHaveAttribute("aria-selected", "false");
  }

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await createQuestion(mb.api, {
      name: "Orders Model",
      type: "model",
      query: { "source-table": ORDERS_ID },
    });
    await visitModel(page, id);
  });

  test("should pick sensible display for model based questions (metabase#32963)", async ({
    page,
  }) => {
    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: /Summarize/ })
      .click();

    const dataset = waitForDataset(page);
    await rightSidebar(page)
      .getByText("Created At", { exact: true })
      .first()
      .click();
    await rightSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await dataset;
    await assertLineChart(page);

    // Go back to the original model
    await page
      .getByTestId("qb-header")
      .getByText("Orders Model", { exact: true })
      .click();
    await openNotebook(page);

    await page.getByRole("button", { name: "Summarize", exact: true }).click();
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("Created At", { exact: true }).click();
    await visualize(page);
    await assertLineChart(page);
  });
});

test.describe("issues 35039 and 37009", () => {
  // We only need to ensure there is a comment. Any comment.
  const query = "select * from products limit 1 -- foo";

  const cardDetails = {
    name: "35039",
    type: "model" as const,
    native: { query },
    visualization_settings: {},
  };

  async function assertResultsLoaded(page: Page) {
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "Rustic Paper Wallet" }).first(),
    ).toBeVisible();
  }

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id } = await createNativeQuestion(mb.api, cardDetails);
    // It is crucial for this repro to go directly to the "edit query definition"
    // page! (see the upstream comment)
    await page.goto(`/model/${id}/query`);
    await assertResultsLoaded(page);
  });

  // This test follows #37009 repro steps because they are simpler than #35039
  // but still equivalent
  test("should show columns available in the model (metabase#35039) (metabase#37009)", async ({
    page,
  }) => {
    // The repro requires that we update the query in a minor, non-impactful way.
    await focusNativeEditor(page);
    await page.keyboard.press("Backspace");
    const dataset = waitForDataset(page);
    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    await dataset;

    await datasetEditBar(page)
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      datasetEditBar(page).getByRole("button", { name: "Saving…" }),
    ).toHaveCount(0);

    await assertResultsLoaded(page);

    await openNotebook(page);
    await page.getByTestId("fields-picker").click();
    for (const column of [
      "ID",
      "EAN",
      "TITLE",
      "CATEGORY",
      "VENDOR",
      "PRICE",
      "RATING",
      "CREATED_AT",
    ]) {
      await expect(
        popover(page).getByText(column, { exact: true }),
      ).toBeVisible();
    }
  });
});

test.describe("issue 37009", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should prevent saving new and updating existing models without result_metadata (metabase#37009)", async ({
    page,
  }) => {
    await startNewNativeModel(page, { query: "select * from products" });

    await expect(
      datasetEditBar(page).getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await datasetEditBar(page)
      .getByRole("button", { name: "Save", exact: true })
      .hover({ force: true });
    await expect(page.getByRole("tooltip")).toHaveText(
      "You must run the query before you can save this model",
    );

    const dataset = waitForDataset(page);
    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    await dataset;
    // Upstream asserts NO tooltip exists. In Playwright the play-button click
    // parks the real cursor on the run button, which opens its own
    // "Run query (⌘ + enter)" tooltip that Cypress's synthetic click never
    // triggers — so scope the assertion to the validation tooltip the test
    // actually cares about (it must clear once the query has run).
    await expect(
      page.getByRole("tooltip", {
        name: "You must run the query before you can save this model",
        exact: true,
      }),
    ).toHaveCount(0);

    const saveButton = datasetEditBar(page).getByRole("button", {
      name: "Save",
      exact: true,
    });
    await expect(saveButton).toBeEnabled();

    const saveCard = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );
    await saveButton.click();
    // eslint-disable-next-line no-restricted-syntax -- H.modal().last() mirrors upstream
    const saveModal = modal(page).last();
    await saveModal.getByLabel("Name", { exact: true }).fill("Model");
    await saveModal.getByRole("button", { name: "Save", exact: true }).click();
    const saveResponse = await saveCard;
    expect(saveResponse.request().postDataJSON().result_metadata).not.toBeNull();

    await openQuestionActions(page, "Edit query definition");
    await typeInNativeEditor(page, " WHERE CATEGORY = 'Gadget'");
    await expect(
      datasetEditBar(page).getByRole("button", {
        name: "Save changes",
        exact: true,
      }),
    ).toBeDisabled();
    await datasetEditBar(page)
      .getByRole("button", { name: "Save changes", exact: true })
      .hover({ force: true });
    await expect(page.getByRole("tooltip")).toHaveText(
      "You must run the query before you can save this model",
    );

    const dataset2 = waitForDataset(page);
    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    await dataset2;
    await expect(
      page.getByRole("tooltip", {
        name: "You must run the query before you can save this model",
        exact: true,
      }),
    ).toHaveCount(0);

    const saveChanges = datasetEditBar(page).getByRole("button", {
      name: "Save changes",
      exact: true,
    });
    await expect(saveChanges).toBeEnabled();
    const updateCard = waitForCardUpdate(page);
    await saveChanges.click();
    const updateResponse = await updateCard;
    expect(
      updateResponse.request().postDataJSON().result_metadata,
    ).not.toBeNull();
  });
});
