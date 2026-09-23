/**
 * Playwright port of e2e/test/scenarios/dashboard/text-cards.cy.spec.js
 *
 * Port notes:
 * - Snowplow assertions run against the per-slot collector (support/snowplow).
 * - Text cards render Markdown, so typed `Text *text* __text__` is asserted via
 *   getByText("Text text text") on the rendered <p> — never toHaveValue.
 * - The text card's "Show visualization options" opens a Mantine Modal
 *   (ChartSettingsButton → <Modal>), which blocks pointer events over the
 *   dashcard. The Cypress `realHover()` before the "Visualize another way"
 *   not-exist check just parks the OS cursor and never errors; a Playwright
 *   hover onto the covered card would be intercepted. Since the assertion is a
 *   not-exist, the hover is dropped for that one check (the label never renders
 *   for text cards regardless). The post-Cancel Edit/Preview checks keep the
 *   hover (modal closed).
 * - `parseSpecialCharSequences: false` on the Cypress `.type()` is a no-op for
 *   Playwright fill() (see support/text-cards.ts / addHeadingWhileEditing).
 * - `.get(".text-card-markdown")` / `.get("h2")` / `.get("input")` in Cypress
 *   re-query from root; ported scoped to the dashcard (only one text/heading
 *   card exists at a time, so equivalent and more robust).
 */
import type { Page } from "@playwright/test";

import {
  editBar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
} from "../support/dashboard";
import { dashboardParametersPopover } from "../support/dashboard-core";
import { addTextBox } from "../support/dashboard-management";
import { showDashboardCardActions } from "../support/dashboard-cards";
import {
  addHeadingWhileEditing,
  dashboardParametersContainer,
  editingDashboardParametersContainer,
  mockParameter,
} from "../support/dashboard-parameters";
import { createDashboard, createQuestionAndDashboard } from "../support/factories";
import { fieldValuesCombobox } from "../support/native-filters";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { addTextBoxWhileEditing } from "../support/text-cards";
import { popover, visitDashboard } from "../support/ui";
import { test, expect } from "../support/fixtures";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const EDITING_TEXT = "You're editing this dashboard.";
const TEXT_PLACEHOLDER =
  "You can use Markdown here, and include variables {{like_this}}";
const HEADING_PLACEHOLDER =
  "You can connect widgets to {{variables}} in heading cards.";

/** Blur the focused text/heading editor by clicking the edit-bar label. */
async function blurCardEditor(page: Page) {
  await editBar(page).getByText(EDITING_TEXT, { exact: true }).click();
}

test.describe("scenarios > dashboard > text and headings", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test.describe("text", () => {
    test.beforeEach(async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    });

    test.afterEach(async ({ mb }) => {
      await expectNoBadSnowplowEvents(mb);
    });

    test("should allow creation, editing, and saving of text boxes", async ({
      page,
      mb,
    }) => {
      // should be able to create new text box
      await editDashboard(page);
      await page.getByLabel("Add a heading or text box").click();
      await popover(page).getByText("Text", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(mb, {
        event: "new_text_card_created",
      });

      const card = getDashboardCard(page, 1);
      // textarea should: 1. be auto-focused; 2. have no value;
      // 3. have the markdown placeholder.
      await expect(card.locator("textarea")).toBeFocused();
      await expect(card.locator("textarea")).toHaveValue("");
      await expect(card.locator("textarea")).toHaveAttribute(
        "placeholder",
        TEXT_PLACEHOLDER,
      );

      // should auto-preview on blur (de-focus)
      await blurCardEditor(page);
      // preview should have no textarea element
      await expect(card.locator("textarea")).toHaveCount(0);
      // with no content, preview shows the placeholder content
      await expect(
        card.getByText(TEXT_PLACEHOLDER, { exact: true }),
      ).toBeVisible();

      // should focus textarea editor on click
      await card.click();
      await expect(card.locator("textarea")).toBeFocused();

      // should be able to edit text while focused
      await page.keyboard.type("Text *text* __text__");

      // should auto-preview typed text (rendered markdown)
      await blurCardEditor(page);
      await expect(card.getByText("Text text text")).toBeVisible();

      // should render visualization options
      await showDashboardCardActions(page, 1);
      await card.getByLabel("Show visualization options").click();

      // should not render visualizer option (modal is open, so no hover —
      // the label never renders for text cards regardless)
      await expect(card.getByLabel("Visualize another way")).toHaveCount(0);

      const dialog = page.getByRole("dialog");
      const chartSettings = dialog.getByTestId("chartsettings-sidebar");
      await expect(
        chartSettings.getByText("Vertical Alignment"),
      ).toBeVisible();
      await expect(
        chartSettings.getByText("Horizontal Alignment"),
      ).toBeVisible();
      await expect(chartSettings.getByText("Show background")).toBeVisible();
      await dialog.getByText("Cancel").click(); // dismiss modal

      // should not render edit and preview actions
      await showDashboardCardActions(page, 1);
      await expect(card.getByLabel("Edit card")).toHaveCount(0);
      await expect(card.getByLabel("Preview card")).toHaveCount(0);

      // should allow saving and show up after refresh
      await saveDashboard(page);
      await expect(card.getByText("Text text text")).toBeVisible();
    });

    test("should have a scroll bar for long text (metabase#8333)", async ({
      page,
      mb,
    }) => {
      await addTextBox(
        page,
        "Lorem ipsum dolor sit amet,\n\nfoo\n\nbar\n\nbaz\n\nboo\n\nDonec quis enim porta.",
      );

      await expectUnstructuredSnowplowEvent(mb, {
        event: "new_text_card_created",
      });

      await saveDashboard(page);

      // The test fails if there is no scroll bar
      const markdown = getDashboardCard(page, 1).locator(".text-card-markdown");
      await expect(markdown).toHaveCSS("overflow-x", "hidden");
      await expect(markdown).toHaveCSS("overflow-y", "auto");
      await markdown.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    });

    test("should let you add a parameter to a dashboard with a text box (metabase#11927)", async ({
      page,
    }) => {
      await addTextBox(page, "text text text");

      await setFilter(page, "Text or Category", "Is");

      await selectDashboardFilter(page.getByTestId("dashcard").first(), "Name");
      await saveDashboard(page);

      // confirm text box and filter are still there
      await expect(
        getDashboardCard(page, 1).getByText("text text text"),
      ).toBeVisible();
      await expect(
        dashboardParametersContainer(page).getByText("Text", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("heading", () => {
    test.beforeEach(async ({ page, mb }) => {
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    });

    test.afterEach(async ({ mb }) => {
      await expectNoBadSnowplowEvents(mb);
    });

    test("should allow creation, editing, and saving of heading component", async ({
      page,
      mb,
    }) => {
      // should be able to create new heading
      await editDashboard(page);
      await page.getByLabel("Add a heading or text box").click();
      await popover(page).getByText("Heading", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(mb, {
        event: "new_heading_card_created",
      });

      const card = getDashboardCard(page, 1);
      await expect(card.locator("input")).toBeFocused();
      await expect(card.locator("input")).toHaveValue("");
      await expect(card.locator("input")).toHaveAttribute(
        "placeholder",
        HEADING_PLACEHOLDER,
      );

      // should auto-preview on blur (de-focus)
      await blurCardEditor(page);
      // preview mode should have no input
      await expect(card.locator("input")).toHaveCount(0);
      await expect(
        card.locator("h2").getByText(HEADING_PLACEHOLDER, { exact: true }),
      ).toBeVisible();

      // should focus input editor on click
      await card.click();
      await expect(card.locator("input")).toBeFocused();

      // should be able to edit text while focused
      await page.keyboard.type("Example Heading");

      // should auto-preview typed text
      await blurCardEditor(page);
      await expect(
        card.locator("h2").getByText("Example Heading", { exact: true }),
      ).toBeVisible();

      // should have no visualization options
      await showDashboardCardActions(page, 1);
      await expect(
        card.getByLabel("Show visualization options"),
      ).toHaveCount(0);

      // should not render edit and preview actions
      await showDashboardCardActions(page, 1);
      await expect(card.getByLabel("Edit card")).toHaveCount(0);
      await expect(card.getByLabel("Preview card")).toHaveCount(0);

      // should allow saving and show up after refresh
      await saveDashboard(page);
      await expect(
        card.locator("h2").getByText("Example Heading", { exact: true }),
      ).toBeVisible();
    });
  });
});

test.describe("scenarios > dashboard > parameters in text and heading cards", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const dashboard = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboard.id);
  });

  test("should allow dashboard filters to be connected to tags in text cards", async ({
    page,
  }) => {
    await editDashboard(page);

    await addTextBoxWhileEditing(page, "Variable: {{foo}}");
    await addHeadingWhileEditing(page, "Variable: {{foo}}");

    await setFilter(page, "Number", "Equal to", "Equal to");

    await getDashboardCard(page, 0).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await getDashboardCard(page, 1).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await saveDashboard(page);

    await filterWidget(page).first().click();
    await fieldValuesCombobox(dashboardParametersPopover(page)).pressSequentially(
      "1",
    );
    await page.getByRole("button", { name: "Add filter" }).click();
    await expect(
      getDashboardCard(page, 0).getByText("Variable: 1", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText("Variable: 1", { exact: true }),
    ).toBeVisible();

    await dashboardParametersContainer(page)
      .getByText("1", { exact: true })
      .click();
    await fieldValuesCombobox(dashboardParametersPopover(page)).pressSequentially(
      "2",
    );
    await page.getByRole("button", { name: "Update filter" }).click();
    await expect(
      getDashboardCard(page, 0).getByText("Variable: 1 and 2", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText("Variable: 1 and 2", { exact: true }),
    ).toBeVisible();

    await editDashboard(page);

    await editingDashboardParametersContainer(page)
      .getByText("Equal to", { exact: true })
      .click();
    await expect(
      getDashboardCard(page, 0).getByText("foo", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText("foo", { exact: true }),
    ).toBeVisible();
  });

  test("should not transform text variables to plain text (metabase#31626)", async ({
    page,
  }) => {
    await editDashboard(page);

    const textContent = "Variable: {{foo}}";
    await addTextBoxWhileEditing(page, textContent);
    await addHeadingWhileEditing(page, textContent);

    await setFilter(page, "Number", "Equal to");

    await getDashboardCard(page, 0).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await getDashboardCard(page, 1).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await saveDashboard(page);

    await filterWidget(page).first().click();
    await page.getByPlaceholder("Enter a number").pressSequentially("1");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Add filter" }).click();

    // view mode
    await expect(
      getDashboardCard(page, 0).getByText("Variable: 1", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText("Variable: 1", { exact: true }),
    ).toBeVisible();

    await editDashboard(page);

    await expect(
      getDashboardCard(page, 0).getByText(textContent, { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText(textContent, { exact: true }),
    ).toBeVisible();
  });

  test("should translate parameter values into the instance language", async ({
    page,
    mb,
  }) => {
    // Set user locale to English explicitly so that we can change the site
    // locale separately, without the user locale following it (by default, user
    // locale matches site locale)
    const currentUser = (await (
      await mb.api.get("/api/user/current")
    ).json()) as { id: number };
    await mb.api.put(`/api/user/${currentUser.id}`, { locale: "en" });
    await mb.api.updateSetting("site-locale", "en-ZZ");
    await page.reload();

    await editDashboard(page);

    await addTextBoxWhileEditing(page, "Variable: {{foo}}");
    await addHeadingWhileEditing(page, "Variable: {{foo}}");
    await setFilter(page, "Date picker", "Relative Date");

    await getDashboardCard(page, 0).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await getDashboardCard(page, 1).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await saveDashboard(page);

    await filterWidget(page).first().click();
    await popover(page).getByText("Today", { exact: true }).click();

    await expect(
      getDashboardCard(page, 0).getByText("Variable: [zz] Today", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText("Variable: [zz] Today", {
        exact: true,
      }),
    ).toBeVisible();

    // Let's make sure the localization was reset back to the user locale by
    // checking that specific text exists in English on the homepage.
    await page.goto("/");

    const homePage = page.getByTestId("home-page");
    await expect(
      homePage.getByText("Pick up where you left off", { exact: true }),
    ).toBeVisible();
    await expect(
      homePage.getByText("[zz] Pick up where you left off", { exact: true }),
    ).toHaveCount(0);
  });

  test("should localize date parameters in the instance locale", async ({
    page,
    mb,
  }) => {
    const currentUser = (await (
      await mb.api.get("/api/user/current")
    ).json()) as { id: number };
    await mb.api.put(`/api/user/${currentUser.id}`, { locale: "en" });
    await mb.api.updateSetting("site-locale", "fr");

    // Create dashboard with a single date parameter, and a single question
    const card = await createQuestionAndDashboard(mb.api, {
      questionDetails: { query: { "source-table": PRODUCTS_ID } },
    });
    const dashboardId = card.dashboard_id;
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      parameters: [
        mockParameter({
          name: "Single Date",
          slug: "single_date",
          id: "ad1c877e",
          type: "date/single",
          sectionId: "date",
        }),
      ],
    });
    // editDashboardCard(card, { size_x: 11, size_y: 6 })
    const { created_at, updated_at, ...cleanCard } = card;
    void created_at;
    void updated_at;
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [{ ...cleanCard, size_x: 11, size_y: 6 }],
    });

    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);

    // Create text card and connect parameter
    await addTextBoxWhileEditing(page, "Variable: {{foo}}");
    await addHeadingWhileEditing(page, "Variable: {{foo}}");

    await editingDashboardParametersContainer(page)
      .getByText("Single Date", { exact: true })
      .click();

    await getDashboardCard(page, 0).getByText("Select…").click();
    await popover(page).getByText("Created At", { exact: true }).click();

    await getDashboardCard(page, 1).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await getDashboardCard(page, 2).getByText("Select…").click();
    await popover(page).getByText("foo", { exact: true }).click();

    await saveDashboard(page);

    await dashboardParametersContainer(page)
      .getByText("Single Date", { exact: true })
      .click();
    const dateTextbox = popover(page).getByRole("textbox").first();
    await dateTextbox.click();
    await dateTextbox.fill("07/19/2026");
    await dateTextbox.blur();
    await page.getByRole("button", { name: "Add filter" }).click();

    // Question should be filtered appropriately
    await expect(
      getDashboardCard(page, 0).getByText("Rustic Paper Wallet"),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 0).getByText("Small Marble Shoes"),
    ).toHaveCount(0);

    // Parameter value in widget should use user localization (English)
    await expect(
      dashboardParametersContainer(page).getByText("July 19, 2026", {
        exact: true,
      }),
    ).toBeVisible();

    // Parameter value in dashboard should use site localization (French)
    await expect(
      getDashboardCard(page, 1).getByText("Variable: juillet 19, 2026", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 2).getByText("Variable: juillet 19, 2026", {
        exact: true,
      }),
    ).toBeVisible();
  });
});
