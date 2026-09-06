/**
 * Playwright port of
 * e2e/test/scenarios/collections/instance-analytics.cy.spec.js.
 *
 * Covers the "Metabase analytics" content (AuditV2): the read-only audit
 * collections (Usage analytics / Custom reports), their pinned audit model and
 * dashboards, saving/duplicating audit content into Custom reports, the
 * move/archive/edit restrictions, and the per-entity "Insights" links.
 *
 * GATE: the EE describes require the pro-self-hosted token (the jar activates
 * it via cypress.env.json); the mirrored OSS describe is gated on an OSS
 * backend, so it cleanly skips on this EE spike backend.
 *
 * Cypress intercepts registered in the beforeEach that are never awaited are
 * dropped; the awaited ones (@datasetQuery, @fieldValues, @saveCard,
 * @copyDashboard, @collection) are registered before their triggering action
 * per PORTING rule 2.
 */
import { resolveToken } from "../support/api";
import { isOssBackend } from "../support/admin";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import {
  ANALYTICS_COLLECTION_NAME,
  CUSTOM_REPORTS_COLLECTION_NAME,
  METRICS_DASHBOARD_NAME,
  PEOPLE_MODEL_NAME,
  getItemId,
  openCollectionEntryMenu,
  openQuestionInfoSidesheet,
  visitCollection,
} from "../support/instance-analytics";
import { tableInteractive, visitModel, waitForDataset } from "../support/models";
import { tableHeaderClick } from "../support/notebook";
import { openDashboardInfoSidebar } from "../support/dashboard-management";
import { caseSensitiveSubstring } from "../support/text";
import {
  icon,
  modal,
  newButton,
  openNavigationSidebar,
  popover,
  visitDashboard,
  visitQuestion,
} from "../support/ui";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { sidebar } from "../support/dashboard-drill";
import { goToAdmin } from "../support/command-palette";

const hasToken = !!resolveToken("pro-self-hosted");

function waitForFieldValues(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/field\/\d+\/values$/.test(new URL(response.url()).pathname),
  );
}

function waitForSaveCard(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

function waitForCopyDashboard(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/dashboard\/\d+\/copy$/.test(new URL(response.url()).pathname),
  );
}

test.describe("scenarios > Metabase Analytics Collection (AuditV2)", () => {
  test.describe("admin", () => {
    test.skip(!hasToken, "requires the pro-self-hosted token");

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should not show the sidebar preview when working with instance analyics (metabase#49904)", async ({
      page,
    }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await page.getByRole("button", { name: /Editor/ }).click();
      await page.getByLabel("View SQL").click();
      await expect(page.getByTestId("native-query-preview-sidebar")).toBeVisible();

      await openNavigationSidebar(page);
      await page.getByRole("link", { name: /Usage analytics/i }).click();
      await page.getByRole("link", { name: /Metabase metrics/i }).click();
      await page
        .getByRole("link", { name: /Question views last week/i })
        .click();

      await page.getByRole("button", { name: /Editor/ }).click();
      await expect(page.getByLabel("View SQL")).toHaveCount(0);
      await expect(
        page.getByTestId("native-query-preview-sidebar"),
      ).toHaveCount(0);
    });

    test("allows admins to see the instance analytics collection content", async ({
      page,
      mb,
    }) => {
      await visitCollection(page, mb.api, ANALYTICS_COLLECTION_NAME);

      const dataset = waitForDataset(page);
      const peopleItem = page
        .getByTestId("pinned-items")
        .getByText(PEOPLE_MODEL_NAME, { exact: true });
      await peopleItem.scrollIntoViewIfNeeded();
      await peopleItem.click();
      await dataset;

      const table = tableInteractive(page);
      for (const value of [
        "admin@metabase.test",
        "Robert Tableton",
        "Read Only Tableton",
      ]) {
        await expect(table.getByText(value, { exact: true })).toBeVisible();
      }
    });

    test("should default to saving audit content in custom reports collection", async ({
      page,
      mb,
    }) => {
      // saving edited question
      await visitModel(page, await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME));

      await tableHeaderClick(page, "Last Name");

      const fieldValues = waitForFieldValues(page);
      await popover(page).getByText("Filter by this column", { exact: true }).click();
      await fieldValues;
      await popover(page).getByText("Tableton", { exact: true }).click();
      const filtered = waitForDataset(page);
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await filtered;

      await expect(
        page.getByTestId("question-row-count").getByText("Showing 7 rows"),
      ).toBeVisible();

      await page.getByTestId("qb-header").getByText("Save", { exact: true }).click();

      const saveModal = page.getByTestId("save-question-modal");
      await expect(
        saveModal
          .getByTestId("dashboard-and-collection-picker-button")
          .getByText(CUSTOM_REPORTS_COLLECTION_NAME, { exact: true }),
      ).toBeVisible();
      const savedCard = waitForSaveCard(page);
      await saveModal.getByText("Save", { exact: true }).click();
      expect((await savedCard).status()).toBe(200);

      // saving copied question
      await visitModel(page, await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME));

      await icon(page.getByTestId("qb-header"), "ellipsis").click();
      await popover(page).getByText("Duplicate", { exact: true }).click();

      await expect(
        modal(page).getByText(CUSTOM_REPORTS_COLLECTION_NAME, { exact: true }),
      ).toBeVisible();
      const copiedCard = waitForSaveCard(page);
      await modal(page).getByRole("button", { name: "Duplicate" }).click();
      expect((await copiedCard).status()).toBe(200);

      await expect(
        modal(page).getByRole("button", { name: /Duplicate/i }),
      ).toHaveCount(0);

      // saving copied dashboard
      await visitDashboard(
        page,
        mb.api,
        await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, "Person overview"),
      );

      await page
        .getByTestId("dashboard-header")
        .getByText("Make a copy", { exact: true })
        .click();

      await expect(
        modal(page).getByText(CUSTOM_REPORTS_COLLECTION_NAME, { exact: true }),
      ).toBeVisible();
      const copiedDashboard = waitForCopyDashboard(page);
      await modal(page).getByRole("button", { name: "Duplicate" }).click();
      expect((await copiedDashboard).status()).toBe(200);
    });

    test("should not allow moving or archiving analytics collections", async ({
      page,
      mb,
    }) => {
      // -- Custom Reports collection should not be archivable or movable --
      await visitCollection(page, mb.api, CUSTOM_REPORTS_COLLECTION_NAME);

      const collectionMenu = page.getByTestId("collection-menu");
      await icon(collectionMenu, "ellipsis").click();
      // The menu items render in a portal (outside collection-menu), so scoping
      // the "not exist" checks to the menu is intentionally faithful to the
      // Cypress `.within()` scope.
      await expect(
        collectionMenu.getByText(caseSensitiveSubstring("Move to trash")),
      ).toHaveCount(0);
      await expect(
        collectionMenu.getByText(caseSensitiveSubstring("Move")),
      ).toHaveCount(0);

      await visitCollection(page, mb.api, ANALYTICS_COLLECTION_NAME);
      await openCollectionEntryMenu(page, CUSTOM_REPORTS_COLLECTION_NAME);

      await expect(
        popover(page).getByText("Bookmark", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Move to trash", { exact: true }),
      ).toHaveCount(0);
      await expect(
        popover(page).getByText("Move", { exact: true }),
      ).toHaveCount(0);

      // -- Metabase Analytics collection should not be archivable or movable --
      await visitCollection(page, mb.api, ANALYTICS_COLLECTION_NAME);
      await expect(
        icon(page.getByTestId("collection-menu"), "ellipsis"),
      ).toHaveCount(0);

      await visitCollection(page, mb.api, "Our analytics");
      await openCollectionEntryMenu(page, ANALYTICS_COLLECTION_NAME);

      await expect(
        popover(page).getByText("Bookmark", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Move to trash", { exact: true }),
      ).toHaveCount(0);
      await expect(
        popover(page).getByText("Move", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not allow editing analytics content (metabase#36228)", async ({
      page,
      mb,
    }) => {
      // dashboard
      await visitDashboard(
        page,
        mb.api,
        await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, METRICS_DASHBOARD_NAME),
      );

      const dashboardHeader = page.getByTestId("dashboard-header");
      await expect(
        dashboardHeader.getByText("Make a copy", { exact: true }),
      ).toBeVisible();
      await expect(icon(dashboardHeader, "pencil")).toHaveCount(0);

      // model
      await visitModel(page, await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME));

      await icon(page.getByTestId("qb-header"), "ellipsis").click();

      await expect(
        popover(page).getByText("Duplicate", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Edit query definition", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not leak instance analytics database into SQL query builder (metabase#44856)", async ({
      page,
      mb,
    }) => {
      await visitModel(page, await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME));

      await newButton(page).click();
      await popover(page).getByText("SQL query", { exact: true }).click();

      // sample DB should be the only one — no DB selector chevron
      await expect(
        icon(page.getByTestId("gui-builder-data"), "cheverondown"),
      ).toHaveCount(0);
    });

    test("should not leak instance analytics database into permissions editor (metabase#44856)", async ({
      page,
      mb,
    }) => {
      await visitModel(page, await getItemId(mb.api, ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME));

      // it's important that we do this manually, as this will only reproduce if
      // there's no page load
      await goToAdmin(page);
      await page
        .getByLabel("Navigation bar")
        .getByText("Permissions", { exact: true })
        .click();
      await sidebar(page).getByText("Administrators", { exact: true }).click();
      await expect(
        page
          .getByTestId("permission-table")
          .getByText(/internal metabase database/i),
      ).toHaveCount(0);

      await sidebar(page).getByText("Databases", { exact: true }).click();
      await expect(
        sidebar(page).getByText(/internal metabase database/i),
      ).toHaveCount(0);
    });
  });

  test.describe("API tests", () => {
    test.skip(!hasToken, "requires the pro-self-hosted token");

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should not allow editing analytics content (metabase#36228)", async ({
      mb,
    }) => {
      const rootItems = (await (
        await mb.api.get("/api/collection/root/items")
      ).json()) as { data: { id: number; name: string; can_write: boolean }[] };

      const analyticsCollection = rootItems.data.find(
        ({ name }) => name === ANALYTICS_COLLECTION_NAME,
      );
      expect(analyticsCollection).toBeTruthy();
      expect(analyticsCollection!.can_write).toBe(false);

      const items = (await (
        await mb.api.get(`/api/collection/${analyticsCollection!.id}/items`)
      ).json()) as { data: { id: number; model: string }[] };

      const cards = items.data.filter(
        ({ model }) => model === "card" || model === "dataset",
      );
      const dashboards = items.data.filter(({ model }) => model === "dashboard");

      for (const { id } of cards) {
        const card = (await (await mb.api.get(`/api/card/${id}`)).json()) as {
          can_write: boolean;
        };
        expect(card.can_write).toBe(false);
      }

      for (const { id } of dashboards) {
        const dashboard = (await (
          await mb.api.get(`/api/dashboard/${id}`)
        ).json()) as { can_write: boolean };
        expect(dashboard.can_write).toBe(false);
      }
    });
  });
});

test.describe("question and dashboard links", () => {
  test.describe("ee", () => {
    test.skip(!hasToken, "requires the pro-self-hosted token");

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should show an analytics link for questions", async ({ page }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      const collection = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith("/api/collection/"),
      );

      const sheet = await openQuestionInfoSidesheet(page);
      await sheet.getByRole("link", { name: /Insights/ }).click();
      await collection;

      await findByDisplayValue(page.locator("body"), "Question overview");

      await expect(
        page.getByRole("button", { name: /Question ID/ }),
      ).toContainText(String(ORDERS_QUESTION_ID));

      const dashcard = page
        .getByTestId("dashcard")
        .filter({ hasText: "Question metadata" })
        .first();
      await expect(
        dashcard.getByText("Entity ID", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText(String(ORDERS_QUESTION_ID), { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("Name", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("Orders", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("Entity Type", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("question", { exact: true }).first(),
      ).toBeVisible();
    });

    test("should show an analytics link for dashboards", async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

      const collection = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith("/api/collection/"),
      );

      await openDashboardInfoSidebar(page);
      await page.getByRole("link", { name: /Insights/ }).click();
      await collection;

      await findByDisplayValue(page.locator("body"), "Dashboard overview");

      await expect(
        page.getByRole("button", { name: /Dashboard ID/ }),
      ).toContainText(String(ORDERS_DASHBOARD_ID));

      const dashcard = page
        .getByTestId("dashcard")
        .filter({ hasText: "Dashboard metadata" })
        .first();
      await expect(
        dashcard.getByText("Entity ID", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText(String(ORDERS_DASHBOARD_ID), { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("Name", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("Orders in a dashboard", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("Entity Type", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        dashcard.getByText("dashboard", { exact: true }).first(),
      ).toBeVisible();
    });

    test("should not show option for users with no access to Metabase Analytics", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await visitQuestion(page, ORDERS_QUESTION_ID);

      const questionSheet = await openQuestionInfoSidesheet(page);
      await expect(
        questionSheet.getByRole("link", { name: /Insights/i }),
      ).toHaveCount(0);

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await openDashboardInfoSidebar(page);
      await expect(
        page.getByRole("link", { name: /Insights/i }),
      ).toHaveCount(0);
    });
  });

  test.describe("oss", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      test.skip(
        !(await isOssBackend(mb.api)),
        "@OSS — requires an OSS backend",
      );
    });

    test("should never appear in OSS", async ({ page, mb }) => {
      await visitQuestion(page, ORDERS_QUESTION_ID);

      const questionSheet = await openQuestionInfoSidesheet(page);
      await expect(
        questionSheet.getByRole("link", { name: /Insights/i }),
      ).toHaveCount(0);

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await openDashboardInfoSidebar(page);
      await expect(
        page.getByRole("link", { name: /Insights/i }),
      ).toHaveCount(0);
    });
  });
});
