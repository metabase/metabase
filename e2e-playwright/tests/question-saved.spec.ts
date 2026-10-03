/**
 * Playwright port of e2e/test/scenarios/question/saved.cy.spec.js
 *
 * Notes:
 * - The Cypress beforeEach registered a "cardCreate" intercept for the whole
 *   suite; here the POST /api/card wait is registered just before each click
 *   that fires it.
 * - The "alerts" describe is @external in Cypress (webhook-tester + maildev
 *   containers) — gated on WEBHOOK_TESTER_ENABLED.
 */
import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import { selectFilterOperator } from "../support/joins";
import { undoToast } from "../support/metrics";
import { modal, openQuestionActions, summarize } from "../support/models";
import {
  entityPickerModal,
  miniPicker,
  tableHeaderClick,
  tableHeaderColumn,
} from "../support/notebook";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  SECOND_COLLECTION_ID,
  WEBHOOK_TEST_HOST,
  WEBHOOK_TEST_SESSION_ID,
  WEBHOOK_TEST_URL,
  addNotificationHandlerChannel,
  collectionOnTheGoModal,
  dashboardCards,
  getAlertChannel,
  removeNotificationHandlerChannel,
  resetWebhookTester,
  rightSidebar,
  setupSMTP,
  tablePickerTable,
  visitDataModel,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "../support/question-saved";
import { questionInfoButton, sidesheet, waitForRevert } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { visitPublicQuestion } from "../support/sharing";
import { appBar, popover, queryBuilderHeader, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

function waitForCardCreate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

test.describe("scenarios > question > saved", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("view and filter saved question", async ({ page }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    // question and table name appears
    await expect(
      page.getByText("Orders", { exact: true }).first(),
    ).toBeVisible();

    // capture the view header height in the saved state to assert it does not
    // change after the question transitions to ad-hoc (UXW-3751)
    const savedHeaderHeight = (await queryBuilderHeader(page).boundingBox())
      ?.height;

    // filter to only orders with quantity=100
    await tableHeaderClick(page, "Quantity");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await selectFilterOperator(page, "Equal to");
    const filterPopover = popover(page);
    await filterPopover
      .getByPlaceholder("Search the list", { exact: true })
      .pressSequentially("100");
    await filterPopover.getByText("100", { exact: true }).click();
    await filterPopover.getByText("Add filter", { exact: true }).click();
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("Quantity is equal to 100", { exact: true }),
    ).toBeVisible();
    // query updated
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 2 rows",
    );

    // view header height should be unchanged in the ad-hoc state
    await expect
      .poll(async () => (await queryBuilderHeader(page).boundingBox())?.height)
      .toBe(savedHeaderHeight);

    // check that save will give option to replace
    await queryBuilderHeader(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const saveModal = page.getByTestId("save-question-modal");
    await expect(
      saveModal.getByText('Replace original question, "Orders"', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      saveModal.getByText("Save as new question", { exact: true }),
    ).toBeVisible();
    await saveModal.getByText("Cancel", { exact: true }).click();

    // click "Started from Orders" and check that the original question is restored
    await expect(appBar(page).getByText(/Started from/).last()).toBeVisible();
    await appBar(page)
      .getByRole("link", { name: "Orders", exact: true })
      .click();
    // query updated
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing first 2,000 rows",
    );
    await expect(appBar(page).getByText(/Started from/)).toHaveCount(0);
    await expect(
      page.getByText("Quantity is equal to 100", { exact: true }),
    ).toHaveCount(0);
  });

  test("should duplicate a saved question into a collection", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await openQuestionActions(page);
    await popover(page).getByText("Duplicate", { exact: true }).click();

    const duplicateModal = modal(page);
    await expect(duplicateModal.getByLabel("Name", { exact: true })).toHaveValue(
      "Orders - Duplicate",
    );
    const cardCreate = waitForCardCreate(page);
    await duplicateModal
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await cardCreate;

    await expect(
      page
        .getByTestId("qb-header-left-side")
        .getByTestId("saved-question-header-title"),
    ).toHaveValue("Orders - Duplicate");
  });

  test("should duplicate a saved question into a dashboard", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await openQuestionActions(page);
    await popover(page).getByText("Duplicate", { exact: true }).click();

    const duplicateModal = modal(page);
    await expect(duplicateModal.getByLabel("Name", { exact: true })).toHaveValue(
      "Orders - Duplicate",
    );
    await duplicateModal
      .getByLabel(/Where do you want to save this/)
      .click();

    const picker = entityPickerModal(page);
    await expect(
      picker.getByText("Select a collection or dashboard", { exact: true }),
    ).toBeVisible();
    await picker.getByText("Orders in a dashboard", { exact: true }).click();
    await picker
      .getByRole("button", { name: "Select this dashboard", exact: true })
      .click();
    await expect(picker).toHaveCount(0);

    const cardCreate = waitForCardCreate(page);
    await modal(page)
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await cardCreate;

    await expect(page).toHaveURL(/\/dashboard\//);
    // Retry like Cypress's .should(): the app briefly sets #edit&scrollTo=N
    // and then settles; a one-shot check catches the transient state.
    await expect
      .poll(() => new URL(page.url()).hash)
      .not.toContain("scrollTo");
    await expect(
      dashboardCards(page).getByText("Orders - Duplicate", { exact: true }),
    ).toBeVisible();
  });

  test("should duplicate a saved question to a collection created on the go", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await openQuestionActions(page);
    await popover(page).getByText("Duplicate", { exact: true }).click();

    const duplicateModal = modal(page);
    await expect(duplicateModal.getByLabel("Name", { exact: true })).toHaveValue(
      "Orders - Duplicate",
    );
    await duplicateModal
      .getByTestId("dashboard-and-collection-picker-button")
      .click();

    await entityPickerModal(page)
      .getByText("New collection", { exact: true })
      .click();

    const NEW_COLLECTION = "My New collection";
    // The Cypress spec used collectionOnTheGoModal().then(...), which left the
    // inner queries unscoped; they are properly scoped to the modal here.
    const onTheGoModal = collectionOnTheGoModal(page);
    await onTheGoModal
      .getByPlaceholder("My new collection", { exact: true })
      .fill(NEW_COLLECTION);
    await onTheGoModal.getByText("Create", { exact: true }).click();

    await entityPickerModal(page)
      .getByRole("button", { name: /Select/ })
      .click();

    await expect(duplicateModal.getByLabel("Name", { exact: true })).toHaveValue(
      "Orders - Duplicate",
    );
    await expect(
      duplicateModal.getByTestId("dashboard-and-collection-picker-button"),
    ).toHaveText(NEW_COLLECTION);
    const cardCreate = waitForCardCreate(page);
    await duplicateModal
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await cardCreate;

    await expect(
      page
        .getByTestId("qb-header-left-side")
        .getByTestId("saved-question-header-title"),
    ).toHaveValue("Orders - Duplicate");

    await expect(
      appBar(page).getByText(NEW_COLLECTION, { exact: true }),
    ).toBeVisible();
  });

  test("should not add scrollbar to duplicate modal if question name is long (metabase#53364)", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      name: "A".repeat(240),
      query: {
        "source-table": ORDERS_ID,
      },
    });
    await visitQuestion(page, id);

    await openQuestionActions(page);
    await popover(page).getByText("Duplicate", { exact: true }).click();

    const duplicateModal = modal(page);
    await expect(duplicateModal).toBeVisible();
    await expect
      .poll(() =>
        duplicateModal.evaluate((el) => el.scrollWidth - el.clientWidth),
      )
      .toBe(0);
  });

  test("should revert a saved question to a previous version", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await questionInfoButton(page).click();

    const sheet = sidesheet(page);
    const descriptionInput = sheet.getByPlaceholder("Add description", {
      exact: true,
    });
    // EditableText saves on blur only after real input events — fill() alone
    // doesn't mark it dirty (same pattern as the question title rename).
    await descriptionInput.click();
    await descriptionInput.pressSequentially("This is a question");
    const updateQuestion = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.startsWith("/api/card/"),
    );
    await descriptionInput.blur();
    await updateQuestion;

    const historyTab = sheet.getByRole("tab", { name: "History", exact: true });
    await historyTab.click();
    await expect(sheet.getByText(/added a description/i)).toBeVisible();

    // The revert mutation invalidates the revision list. Clicking the History
    // tab before that invalidation lands shows the pre-revert entries — wait
    // for the revert request before re-entering History (same fix as the
    // Cypress spec).
    const revertRevision = waitForRevert(page);
    await sheet.getByTestId("question-revert-button").click();
    await revertRevision;

    await historyTab.click();
    await expect(
      sheet.getByText(/reverted to an earlier version/i),
    ).toBeVisible();
    await expect(sheet.getByText(/This is a question/i)).toHaveCount(0);

    // Simulate a backend failure on revert and confirm we surface
    // the error message as a toast (UXW-310).
    await page.route("**/api/revision/revert", (route) =>
      route.fulfill({
        status: 500,
        json: { message: "Cannot revert: missing card" },
      }),
    );
    const failedRevert = waitForRevert(page);
    await sheet.getByTestId("question-revert-button").first().click();
    await failedRevert;

    await expect(undoToast(page)).toContainText("Cannot revert: missing card");
  });

  test("should show collection breadcrumbs for a saved question in the root collection", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await appBar(page).getByText("Our analytics", { exact: true }).click();

    await expect(page.getByText("Orders", { exact: true })).toBeVisible();
  });

  test("should show collection breadcrumbs for a saved question in a non-root collection", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
      collection_id: SECOND_COLLECTION_ID,
    });

    await visitQuestion(page, ORDERS_QUESTION_ID);
    await appBar(page).getByText("Second collection", { exact: true }).click();

    await expect(page.getByText("Orders", { exact: true })).toBeVisible();
  });

  test("should show dashboard breadcrumbs for a saved question in a dashboard", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, {
      dashboard_id: ORDERS_DASHBOARD_ID,
    });

    await visitQuestion(page, ORDERS_QUESTION_ID);
    await expect(
      appBar(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
    // should be able to navigate to the parent dashboard
    await appBar(page)
      .getByText("Orders in a dashboard", { exact: true })
      .click();

    // should have dashboard info disappear when navigating away from question
    await expect(
      appBar(page).getByText("Our analytics", { exact: true }),
    ).toBeVisible();
    await expect(
      appBar(page).getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);

    await expect(page.getByText("Orders", { exact: true })).toBeVisible();
  });

  test("should show the question lineage when a saved question is changed", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    await summarize(page);
    const sidebar = rightSidebar(page);
    await sidebar.getByText("Quantity", { exact: true }).click();
    await sidebar.getByRole("button", { name: "Done", exact: true }).click();

    // .last() = the innermost element containing the lineage text (ancestors
    // inside the app bar match the substring regex too).
    await expect(appBar(page).getByText(/Started from/).last()).toBeVisible();
    await appBar(page).getByText("Orders", { exact: true }).click();
    await expect(appBar(page).getByText(/Started from/)).toHaveCount(0);
  });

  test("'read-only' user should be able to resize column width (metabase#9772)", async ({
    page,
    mb,
  }) => {
    await mb.signIn("readonly");
    await visitQuestion(page, ORDERS_QUESTION_ID);

    const headerCell = tableHeaderColumn(page, "Tax");
    await expect(headerCell).toBeVisible();
    const originalWidth = (await headerCell.boundingBox())!.width;

    const moveX = 100;
    const minWidth = originalWidth + moveX * 0.6;

    // The TanStack resize handle re-renders while the grid measures itself, so
    // a single drag is occasionally lost or only partially applied and the
    // column never grows enough. Re-run the (idempotent, gte-checked) drag
    // until the column has actually widened.
    for (let attempt = 0; attempt < 5; attempt++) {
      const handle = page.getByTestId("resize-handle-TAX");
      const handleBox = await handle.boundingBox();
      if (!handleBox) {
        break;
      }
      const startX = handleBox.x + handleBox.width / 2;
      const startY = handleBox.y + handleBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + moveX / 2, startY);
      await page.mouse.move(startX + moveX, startY);
      await page.mouse.up();

      const width = (await headerCell.boundingBox())!.width;
      if (width >= minWidth) {
        break;
      }
    }

    await expect
      .poll(async () => (await headerCell.boundingBox())!.width)
      .toBeGreaterThanOrEqual(minWidth);
  });

  test("should always be possible to view the full title text of the saved question", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);

    const savedQuestionTitle = page.getByTestId("saved-question-header-title");
    await expect(savedQuestionTitle).toBeVisible();
    await savedQuestionTitle.fill(
      "Space, the final frontier. These are the voyages of the Starship Enterprise.",
    );
    await savedQuestionTitle.blur();

    await expect(savedQuestionTitle).toBeVisible();
    // clientHeight: height of the textarea
    // scrollHeight: height of the text content, including content not visible
    await expect
      .poll(() =>
        savedQuestionTitle.evaluate((el) => el.clientHeight - el.scrollHeight),
      )
      .toBe(0);
  });

  test("should not show '- Modified' suffix after we click 'Save' on a new model (metabase#42773)", async ({
    page,
  }) => {
    // Use UI to create a model based on the Products table
    await page.goto("/model/new");
    await page
      .getByTestId("new-model-options")
      .getByText("Use the notebook editor", { exact: true })
      .click();

    const picker = miniPicker(page);
    await picker.getByText("Sample Database", { exact: true }).click();
    await picker.getByText("Products", { exact: true }).click();

    await page
      .getByTestId("dataset-edit-bar")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const cardCreate = waitForCardCreate(page);
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await cardCreate;
    // The Cypress spec used an extremely short timeout (10ms) to catch the
    // transient "- Modified" suffix; the equivalent here is a one-shot,
    // no-retry check right after the save request resolves.
    const hasModifiedValue = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input, textarea")).some(
        (el) =>
          (el as HTMLInputElement | HTMLTextAreaElement).value ===
          "Products - Modified",
      ),
    );
    expect(hasModifiedValue).toBe(false);
  });

  test.describe("with hidden tables", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    const HIDDEN_TYPES = ["hidden", "technical", "cruft"] as const;

    async function hideTable(
      page: Page,
      mb: { api: { put: (url: string, data?: unknown) => Promise<unknown> } },
      {
        name,
        id,
        visibilityType,
      }: { name: string; id: number; visibilityType: string },
    ) {
      // Since v56 it's no longer possible to specify the reason (e.g.
      // "technical" or "cruft") for hiding the table via UI. We still want to
      // support cases where visibility type has been set to such values in
      // the past, so we simulate it with an API call.
      if (visibilityType === "technical" || visibilityType === "cruft") {
        await mb.api.put(`/api/table/${id}`, {
          visibility_type: visibilityType,
        });
      } else {
        await visitDataModel(page);
        const table = tablePickerTable(page, name);
        await table.click();
        const tableUpdate = page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname.startsWith("/api/table/"),
        );
        await table
          .getByRole("button", { name: "Hide table", exact: true })
          .click();
        await tableUpdate;
      }
    }

    for (const visibilityType of HIDDEN_TYPES) {
      test(`should show a View-only tag when the source table is marked as ${visibilityType}`, async ({
        page,
        mb,
      }) => {
        await hideTable(page, mb, {
          name: "Orders",
          id: ORDERS_ID,
          visibilityType,
        });

        await visitQuestion(page, ORDERS_QUESTION_ID);

        const viewOnlyTag = queryBuilderHeader(page).getByText("View-only", {
          exact: true,
        });
        await expect(viewOnlyTag).toBeVisible();
        await viewOnlyTag.hover();
        await expect(
          popover(page).getByText(
            "One of the administrators hid the source table “Orders”, making this question view-only.",
            { exact: true },
          ),
        ).toBeVisible();
      });

      test(`should show a View-only tag when a joined table is marked as ${visibilityType}`, async ({
        page,
        mb,
      }) => {
        await mb.signInAsAdmin();
        await hideTable(page, mb, {
          name: "Products",
          id: PRODUCTS_ID,
          visibilityType,
        });
        const { id } = await mb.api.createQuestion({
          name: "Joined question",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                "source-table": PRODUCTS_ID,
                alias: "Orders",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  ["field", SAMPLE_DATABASE.PRODUCTS.ID, { "join-alias": "Products" }],
                ],
                fields: "all",
              },
            ],
          },
        });
        await visitQuestion(page, id);

        const viewOnlyTag = queryBuilderHeader(page).getByText("View-only", {
          exact: true,
        });
        await expect(viewOnlyTag).toBeVisible();
        await viewOnlyTag.hover();
        await expect(
          popover(page).getByText(
            "One of the administrators hid the source table “Products”, making this question view-only.",
            { exact: true },
          ),
        ).toBeVisible();
      });
    }

    async function moveQuestionTo(page: Page, newCollectionName: RegExp) {
      await openQuestionActions(page);
      await page.getByTestId("move-button").click();
      const picker = entityPickerModal(page);
      await picker.getByText(newCollectionName).click();
      const cardUpdate = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname.startsWith("/api/card/"),
      );
      await picker.getByRole("button", { name: "Move", exact: true }).click();
      await cardUpdate;
    }

    test("should show a View-only tag when one of the source cards is unavailable", async ({
      page,
      mb,
    }) => {
      const { id: questionId } = await mb.api.createQuestion({
        name: "Products Question + Orders",
        query: {
          "source-table": `card__${ORDERS_QUESTION_ID}`,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              alias: "Orders Question",
              fields: "all",
              condition: [
                "=",
                // The Cypress spec wrote PRODUCTS.PRODUCT_ID here — a field
                // that doesn't exist on Products, so it serialized to null in
                // the request body. Kept as null for a byte-identical API
                // call; card creation doesn't validate the condition and the
                // test only exercises source-card visibility.
                ["field", null, null],
                ["field", ORDERS.ID, { "join-alias": "Orders" }],
              ],
            },
          ],
        },
      });

      await visitQuestion(page, ORDERS_QUESTION_ID);
      await moveQuestionTo(page, /Personal Collection/);

      await mb.signInAsNormalUser();
      await visitQuestion(page, questionId);

      await expect(
        queryBuilderHeader(page).getByText("View-only", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("with watermark", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await page.route("**/api/session/properties", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body["token-features"].development_mode = true;
        await route.fulfill({ response, json: body });
      });

      await mb.api.put(`/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
        collection_position: 1,
        enable_embedding: true,
      });

      await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        enable_embedding: true,
      });
    });

    test("should show questions with a watermark when in dev mode whereever we show visualizations", async ({
      page,
      mb,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      await expect(page.getByTestId("development-watermark")).toHaveCount(1);

      await appBar(page)
        .getByRole("link", { name: /Our analytics/i })
        .click();
      await expect(
        page
          .getByTestId("pinned-items")
          .getByTestId("development-watermark"),
      ).not.toHaveCount(0);

      await page
        .getByTestId("collection-table")
        .getByRole("link", { name: /Orders in a dashboard/i })
        .click();
      await expect(page.getByTestId("development-watermark")).not.toHaveCount(
        0,
      );

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: ORDERS_DASHBOARD_ID },
        params: {},
      });
      await expect(page.getByTestId("development-watermark")).not.toHaveCount(
        0,
      );

      await visitEmbeddedPage(page, mb, {
        resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
        params: {},
      });
      await expect(page.getByTestId("development-watermark")).not.toHaveCount(
        0,
      );

      // Need to sign in to generate the public link for the orders question
      await mb.signInAsAdmin();

      await visitPublicQuestion(page, mb, ORDERS_QUESTION_ID);
      await expect(page.getByTestId("development-watermark")).not.toHaveCount(
        0,
      );

      // Need to sign in to generate the public link for the orders dashboard
      await mb.signInAsAdmin();

      await visitPublicDashboard(page, mb, ORDERS_DASHBOARD_ID);
      await expect(page.getByTestId("development-watermark")).not.toHaveCount(
        0,
      );
    });
  });
});

// Ensure the webhook tester docker container is running:
// docker run -p 9080:8080/tcp tarampampam/webhook-tester:1.1.0 serve --create-session 00000000-0000-0000-0000-000000000000
// (@external in Cypress; also needs maildev for setupSMTP)
test.describe("scenarios > question > saved > alerts", () => {
  test.skip(
    !process.env.WEBHOOK_TESTER_ENABLED,
    "Requires the webhook-tester and maildev containers (set WEBHOOK_TESTER_ENABLED)",
  );

  const firstWebhookName = "E2E Test Webhook";
  const secondWebhookName = "Toucan Hook";

  test.beforeEach(async ({ mb }) => {
    await resetWebhookTester(mb.api);
    await mb.restore();
    await mb.signInAsAdmin();
    await setupSMTP(mb.api);

    await mb.api.post("/api/channel", {
      name: firstWebhookName,
      description: "All aboard the Metaboat",
      type: "channel/http",
      details: {
        url: WEBHOOK_TEST_URL,
        "auth-method": "none",
        "fe-form-type": "none",
      },
    });

    await mb.api.post("/api/channel", {
      name: secondWebhookName,
      description: "Quack!",
      type: "channel/http",
      details: {
        url: WEBHOOK_TEST_URL,
        "auth-method": "none",
        "fe-form-type": "none",
      },
    });
  });

  test("should allow you to enable a webhook alert", async ({ page }) => {
    await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
    await page.getByLabel("Move, trash, and more…").click();
    await popover(page).getByText("Create an alert", { exact: true }).click();

    await expect(
      modal(page).getByText("New alert", { exact: true }),
    ).toBeVisible();
    await removeNotificationHandlerChannel(page, "Email");
    await addNotificationHandlerChannel(page, secondWebhookName, {
      hasNoChannelsAdded: true,
    });
    await modal(page).getByRole("button", { name: "Done", exact: true }).click();

    await page.getByLabel("Move, trash, and more…").click();
    await popover(page).getByText("Edit alerts", { exact: true }).click();
    await modal(page).getByText(/Created by you/).click();

    await expect(
      modal(page).getByText(secondWebhookName, { exact: true }),
    ).toBeVisible();
  });

  // There is no api to test individual hooks for new Question Alerts
  test("should allow you to test a webhook", async ({ page, mb }) => {
    test.skip(true, "@skip upstream in Cypress");

    await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
    await page.getByLabel("Move, trash, and more…").click();
    await popover(page).getByText("Create an alert", { exact: true }).click();

    const alertModal = modal(page);
    const channel = getAlertChannel(alertModal, firstWebhookName);
    await channel.scrollIntoViewIfNeeded();
    await channel.getByRole("checkbox").click({ force: true });

    const testAlert = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/pulse/test",
    );
    await channel
      .getByRole("button", { name: "Send a test", exact: true })
      .click();
    await testAlert;

    const response = await mb.api.get(
      `${WEBHOOK_TEST_HOST}/api/session/${WEBHOOK_TEST_SESSION_ID}/requests`,
    );
    const body = (await response.json()) as { content_base64: string }[];
    expect(body).toHaveLength(1);

    const content = Buffer.from(body[0].content_base64, "base64").toString(
      "utf8",
    );
    expect(content).toContain("alert_creator_name");
    expect(content).toContain("Bobby Tables");
  });
});
