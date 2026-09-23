/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/temporal-unit-parameters.cy.spec.js
 *
 * Porting notes:
 * - Fixtures + spec-local helpers live in support/temporal-unit-parameters.ts.
 *   Everything else reuses the existing support surface.
 * - cy.intercept("@cardQuery"/"@queryMetadata"): the only explicit wait kept is
 *   test 1's queryMetadata (registered before the triggering addQuestion). The
 *   post-save "@cardQuery" waits are covered by saveDashboard's dashcard-load
 *   settle plus the retrying ensureDashboardCardHasText assertion.
 * - Overlapping dashcards (all created at row 0/col 0): the grid stacks them
 *   vertically, so `should("exist")` → toBeAttached (a stacked card can be off
 *   the fold) and `should("be.visible")` → toBeVisible.
 * - The url click-behavior test (test 9) types an ABSOLUTE dashboard url;
 *   upstream hardcodes localhost:4000 (its baseUrl), so the port builds it from
 *   mb.baseUrl — otherwise the click would navigate off the slot backend.
 * - selectDashboardFilter uses the dashboard-parameters port (first-match,
 *   force click) — the mapping popover repeats "Created At" across FK sections.
 */
import { expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";

import {
  dashboardHeader,
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  saveDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import {
  clearFilterWidget,
  createDashboard,
  dashboardParameterSidebar,
} from "../support/dashboard-parameters";
import {
  visitEmbeddedPage,
} from "../support/embedding-dashboard";
import {
  createNativeQuestion,
  visitDashboardWithParams,
} from "../support/filters-repros";
import { dashboardParametersDoneButton } from "../support/filters-repros-2";
import { undoToast } from "../support/metrics";
import { tableInteractive } from "../support/models";
import { undoToastList } from "../support/organization";
import { appBar, popover, queryBuilderHeader, visitDashboard } from "../support/ui";

import {
  addQuestion,
  addTemporalUnitParameter,
  backToDashboard,
  binningBreakoutQuestionDetails,
  createDashboardWithMappedQuestion,
  createDashboardWithMultiSeriesCard,
  createDashboardWithQuestions,
  dashboardDetails,
  dashcardTableHeaderColumn,
  editParameter,
  ensureDashboardCardHasText,
  expressionBreakoutQuestionDetails,
  getNativeTimeQuestionBasedQuestionDetails,
  multiBreakoutQuestionDetails,
  multiStageQuestionDetails,
  nativeQuestionDetails,
  nativeQuestionWithDateParameterDetails,
  nativeQuestionWithTextParameterDetails,
  nativeTimeQuestionDetails,
  nativeUnitQuestionDetails,
  noBreakoutQuestionDetails,
  parameterDetails,
  questionWithoutDefaultValue,
  removeQuestion,
  resetFilterWidgetToDefault,
  selectDashboardFilter,
  singleBreakoutQuestionDetails,
} from "../support/temporal-unit-parameters";

function waitForQueryMetadata(page: Page) {
  return page.waitForResponse((response) =>
    /^\/api\/card\/\d+\/query_metadata$/.test(new URL(response.url()).pathname),
  );
}

test.describe("scenarios > dashboard > temporal unit parameters", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("mapping targets", () => {
    test("should connect a parameter to a question and drill thru", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      await api.createQuestion(noBreakoutQuestionDetails);
      await api.createQuestion(singleBreakoutQuestionDetails);
      await api.createQuestion(multiBreakoutQuestionDetails);
      await api.createQuestion(multiStageQuestionDetails);
      await api.createQuestion(expressionBreakoutQuestionDetails);
      await api.createQuestion(binningBreakoutQuestionDetails);
      await createNativeQuestion(api, nativeQuestionWithDateParameterDetails);
      const dashboard = await createDashboard(api, dashboardDetails);
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);

      // single breakout
      const metadata = waitForQueryMetadata(page);
      await addQuestion(page, singleBreakoutQuestionDetails.name);
      await ensureDashboardCardHasText(page, "April 2025");
      await metadata;
      await editParameter(page, parameterDetails.name);
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page).getByText("Created At: Month", { exact: true }).click();
      await saveDashboard(page);

      await ensureDashboardCardHasText(page, "April 2025");
      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(singleBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(
        tableInteractive(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await backToDashboard(page);
      await editDashboard(page);
      await removeQuestion(page);

      // multiple breakouts
      await addQuestion(page, multiBreakoutQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await getDashboardCard(page).getByText("Select…").click();
      await expect(
        popover(page).getByText("Created At: Month", { exact: true }),
      ).toHaveCount(1);
      await popover(page)
        .getByText("Created At: Month", { exact: true })
        .first()
        .click();
      await saveDashboard(page);
      await ensureDashboardCardHasText(page, "Created At: Year");
      await filterWidget(page).first().click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Q2 2025", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(multiBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(
        tableInteractive(page).getByText("Created At: Quarter", { exact: true }),
      ).toBeVisible();
      await backToDashboard(page);
      await editDashboard(page);
      await removeQuestion(page);

      // multiple stages
      await addQuestion(page, multiStageQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page)
        .getByText("Created At: Month: Year", { exact: true })
        .click();
      await saveDashboard(page);
      await filterWidget(page).first().click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Quarter", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(multiStageQuestionDetails.name, { exact: true })
        .click();
      await expect(
        tableInteractive(page).getByText("Created At: Quarter", { exact: true }),
      ).toBeVisible();
      await backToDashboard(page);
      await editDashboard(page);
      await removeQuestion(page);

      // no breakout
      await addQuestion(page, noBreakoutQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await expect(
        getDashboardCard(page).getByText("No valid fields", { exact: true }),
      ).toBeVisible();
      await dashboardParametersDoneButton(page).click();
      await removeQuestion(page);

      // breakout by expression
      await addQuestion(page, expressionBreakoutQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page).getByText("Date: Day", { exact: true }).click();
      await saveDashboard(page);
      await filterWidget(page).first().click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Date: Quarter", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(expressionBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(
        tableInteractive(page).getByText("Date: Quarter", { exact: true }),
      ).toBeVisible();
      await backToDashboard(page);
      await editDashboard(page);
      await removeQuestion(page);

      // breakout by a column with a binning strategy
      await addQuestion(page, binningBreakoutQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await expect(
        getDashboardCard(page).getByText("No valid fields", { exact: true }),
      ).toBeVisible();
      await dashboardParametersDoneButton(page).click();
      await removeQuestion(page);

      // native query
      await addQuestion(page, nativeQuestionWithDateParameterDetails.name);
      await editParameter(page, parameterDetails.name);
      await expect(
        getDashboardCard(page).getByText(/Add a variable to this question/),
      ).toBeVisible();
    });

    test("should connect a parameter to a model", async ({ page, mb }) => {
      const api = mb.api;
      await api.createQuestion({
        ...singleBreakoutQuestionDetails,
        type: "model",
      });
      await createNativeQuestion(api, {
        ...nativeQuestionDetails,
        type: "model",
      });
      const dashboard = await createDashboard(api, dashboardDetails);
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);

      // MBQL model
      await addQuestion(page, singleBreakoutQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await expect(
        getDashboardCard(page).getByText("No valid fields", { exact: true }),
      ).toBeVisible();
      await dashboardParametersDoneButton(page).click();
      await removeQuestion(page);
    });

    test("should connect a parameter to a metric", async ({ page, mb }) => {
      const api = mb.api;
      await api.createQuestion({
        ...singleBreakoutQuestionDetails,
        type: "metric",
      });
      const dashboard = await createDashboard(api, dashboardDetails);
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);

      await addQuestion(page, singleBreakoutQuestionDetails.name);
      await editParameter(page, parameterDetails.name);
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page).getByText("Created At: Month", { exact: true }).click();
      await saveDashboard(page);
      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(singleBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(
        queryBuilderHeader(page).getByText(
          `${singleBreakoutQuestionDetails.name} by Created At: Year`,
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should connect multiple parameters to a card with multiple breakouts and drill thru", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      await api.createQuestion(multiBreakoutQuestionDetails);
      const dashboard = await createDashboard(api, dashboardDetails);
      await visitDashboard(page, api, dashboard.id);

      await editDashboard(page);
      await addQuestion(page, multiBreakoutQuestionDetails.name);
      await addTemporalUnitParameter(page);
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page)
        .getByText("Created At: Month", { exact: true })
        .first()
        .click();
      await addTemporalUnitParameter(page);
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page)
        .getByText("Created At: Year", { exact: true })
        .first()
        .click();
      await saveDashboard(page);

      await filterWidget(page).nth(0).click();
      await popover(page).getByText("Year", { exact: true }).click();
      await filterWidget(page).nth(1).click();
      await popover(page).getByText("Week", { exact: true }).click();
      // Expect these dates to change when we shift years in the Sample Database
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("April 27, 2025", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("May 4, 2025", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(multiBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(appBar(page)).toContainText("Started from");
      await expect(appBar(page)).toContainText(multiBreakoutQuestionDetails.name);
      await expect(
        tableInteractive(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await expect(
        tableInteractive(page).getByText("April 27, 2025", { exact: true }),
      ).toBeVisible();
    });

    test("should connect multiple parameters to the same column in a card and drill thru, with the last parameter taking priority", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      await api.createQuestion(singleBreakoutQuestionDetails);
      const dashboard = await createDashboard(api, dashboardDetails);
      await visitDashboard(page, api, dashboard.id);

      await editDashboard(page);
      await addQuestion(page, singleBreakoutQuestionDetails.name);
      await addTemporalUnitParameter(page);
      await selectDashboardFilter(getDashboardCard(page), "Created At");
      await addTemporalUnitParameter(page);
      await selectDashboardFilter(getDashboardCard(page), "Created At");
      await saveDashboard(page);

      await filterWidget(page).nth(0).click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await filterWidget(page).nth(1).click();
      await popover(page).getByText("Year", { exact: true }).click();
      // metabase#44684
      // should be "Created At: Year" and "2025" because the last parameter is "Year"
      await expect(
        getDashboardCard(page).getByText("Created At: Quarter", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Q2 2025", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(singleBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(appBar(page)).toContainText("Started from");
      await expect(appBar(page)).toContainText(
        singleBreakoutQuestionDetails.name,
      );
      await expect(
        tableInteractive(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await expect(
        tableInteractive(page).getByText("2025", { exact: true }),
      ).toBeVisible();
    });

    test("should connect a parameter to multiple questions within a dashcard and drill thru", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMultiSeriesCard(api);
      await visitDashboard(page, api, dashboard.id);

      await editDashboard(page);
      await addTemporalUnitParameter(page);
      await expect(getDashboardCard(page).getByText("Select…")).toHaveCount(2);
      await getDashboardCard(page).getByText("Select…").nth(0).click();
      await popover(page).getByText("Created At: Month", { exact: true }).click();
      await getDashboardCard(page).getByText("Select…").click();
      await popover(page).getByText("Created At: Month", { exact: true }).click();
      await saveDashboard(page);

      await filterWidget(page).first().click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Q1 2026", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByTestId("legend-item")
        .filter({ hasText: "Question 1" })
        .click();
      await expect(appBar(page)).toContainText("Started from");
      await expect(appBar(page)).toContainText("Question 1");
      await expect(
        queryBuilderHeader(page).getByText("Count by Created At: Quarter", {
          exact: true,
        }),
      ).toBeVisible();
      await backToDashboard(page);

      await expect(
        getDashboardCard(page).getByText("Q1 2026", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByTestId("legend-item")
        .filter({ hasText: "Question 2" })
        .click();
      await expect(appBar(page)).toContainText("Started from");
      await expect(appBar(page)).toContainText("Question 2");
      await expect(
        queryBuilderHeader(page).getByText("Count by Created At: Quarter", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("click behaviors", () => {
    test("should pass a temporal unit with 'update dashboard filter' click behavior", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api, {
        extraQuestions: [nativeUnitQuestionDetails],
      });
      const dashboardId = dashboard.id;
      await visitDashboard(page, api, dashboardId);

      // unsupported column types are ignored
      await editDashboard(page);
      const card0 = getDashboardCard(page, 0);
      await card0.hover();
      await card0.getByLabel("Click behavior").click({ force: true });
      // datetime columns cannot be mapped
      await sidebar(page).getByText("Created At: Month", { exact: true }).click();
      await sidebar(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await expect(
        sidebar(page).getByText("No available targets", { exact: true }),
      ).toBeVisible();
      await sidebar(page).locator(".Icon-chevronleft").click();
      // number columns cannot be mapped
      await sidebar(page).getByText("Count", { exact: true }).click();
      await sidebar(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await expect(
        sidebar(page).getByText("No available targets", { exact: true }),
      ).toBeVisible();
      await sidebar(page).getByRole("button", { name: "Cancel" }).click();

      // setup a valid click behavior with a text column
      const card1 = getDashboardCard(page, 1);
      await card1.hover();
      await card1.getByLabel("Click behavior").click({ force: true });
      await sidebar(page).getByText("UNIT", { exact: true }).click();
      await sidebar(page)
        .getByText("Update a dashboard filter", { exact: true })
        .click();
      await sidebar(page).getByText(parameterDetails.name, { exact: true }).click();
      await popover(page).getByText("UNIT", { exact: true }).click();
      await saveDashboard(page);

      // verify click behavior with a valid temporal unit
      // done to bypass a race condition (see updateDashboardAndCards in save.js)
      await visitDashboard(page, api, dashboardId);

      await getDashboardCard(page, 1).getByText("year", { exact: true }).click();
      await expect(
        dashcardTableHeaderColumn(getDashboardCard(page, 0), "Created At: Year"),
      ).toBeVisible();
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();

      // verify that invalid temporal units are ignored
      await getDashboardCard(page, 1)
        .getByText("invalid", { exact: true })
        .click();
      await expect(filterWidget(page).getByText(/invalid/i)).toHaveCount(0);
      await expect(
        dashcardTableHeaderColumn(getDashboardCard(page, 0), "Created At: Month"),
      ).toBeVisible();

      // verify that recovering from an invalid temporal unit works
      await getDashboardCard(page, 1).getByText("year", { exact: true }).click();
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();
      await expect(
        dashcardTableHeaderColumn(getDashboardCard(page, 0), "Created At: Year"),
      ).toBeVisible();
    });

    test("should pass a temporal unit 'custom destination -> dashboard' click behavior", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      await createDashboardWithMappedQuestion(api, {
        dashboardDetails: { name: "Target dashboard" },
      });
      const { dashboard: sourceDashboard } = await createDashboardWithQuestions(
        api,
        {
          dashboardDetails: { name: "Source dashboard" },
          questions: [nativeUnitQuestionDetails],
        },
      );
      const sourceDashboardId = sourceDashboard.id;
      await visitDashboard(page, api, sourceDashboardId);

      // setup click behavior
      await editDashboard(page);
      const card = getDashboardCard(page);
      await card.hover();
      await card.getByLabel("Click behavior").click({ force: true });
      await sidebar(page).getByText("UNIT", { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Dashboard", { exact: true }).click();
      await modal(page).getByText("Target dashboard", { exact: true }).click();
      await sidebar(page).getByText(parameterDetails.name, { exact: true }).click();
      await popover(page).getByText("UNIT", { exact: true }).click();
      await saveDashboard(page);

      // verify that invalid temporal units are ignored
      await getDashboardCard(page).getByText("invalid", { exact: true }).click();
      await expect(
        dashboardHeader(page).getByText("Target dashboard", { exact: true }),
      ).toBeVisible();
      await expect(filterWidget(page).getByText(/invalid/i)).toHaveCount(0);
      await expect(
        getDashboardCard(page).getByText("Created At: Month", { exact: true }),
      ).toBeVisible();

      // verify click behavior with a valid temporal unit
      await visitDashboard(page, api, sourceDashboardId);
      await getDashboardCard(page).getByText("year", { exact: true }).click();
      await expect(
        dashboardHeader(page).getByText("Target dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });

    test("should pass a temporal unit with 'custom destination -> url' click behavior", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const targetDashboard = await createDashboardWithMappedQuestion(api, {
        dashboardDetails: { name: "Target dashboard" },
      });
      const targetDashboardId = targetDashboard.id;
      const { dashboard: sourceDashboard } = await createDashboardWithQuestions(
        api,
        {
          dashboardDetails: { name: "Source dashboard" },
          questions: [nativeUnitQuestionDetails],
        },
      );
      const sourceDashboardId = sourceDashboard.id;
      await visitDashboard(page, api, sourceDashboardId);

      // setup click behavior
      await editDashboard(page);
      const card = getDashboardCard(page);
      await card.hover();
      await card.getByLabel("Click behavior").click({ force: true });
      await sidebar(page).getByText("UNIT", { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("URL", { exact: true }).click();
      await modal(page)
        .getByText("Values you can reference", { exact: true })
        .click();
      await expect(popover(page).getByText("UNIT", { exact: true })).toBeVisible();
      await expect(
        popover(page).getByText(parameterDetails.name, { exact: true }),
      ).toHaveCount(0);
      await modal(page)
        .getByPlaceholder("e.g. http://acme.com/id/{{user_id}}")
        .fill(
          `${mb.baseUrl}/dashboard/${targetDashboardId}?${parameterDetails.slug}={{UNIT}}`,
        );
      await modal(page).getByRole("button", { name: "Done" }).click();
      await saveDashboard(page);

      // verify click behavior with a valid temporal unit
      await getDashboardCard(page).getByText("year", { exact: true }).click();
      await expect(
        dashboardHeader(page).getByText("Target dashboard", { exact: true }),
      ).toBeVisible();
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();

      // verify that invalid temporal units are ignored
      await visitDashboard(page, api, sourceDashboardId);
      await getDashboardCard(page).getByText("invalid", { exact: true }).click();
      await expect(
        dashboardHeader(page).getByText("Target dashboard", { exact: true }),
      ).toBeVisible();
      await expect(filterWidget(page).getByText(/invalid/i)).toHaveCount(0);
      await expect(
        getDashboardCard(page).getByText("Created At: Month", { exact: true }),
      ).toBeVisible();
    });

    test("should not allow to use temporal unit parameter values with SQL queries", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      await createNativeQuestion(api, nativeQuestionWithTextParameterDetails);
      const dashboard = await createDashboardWithMappedQuestion(api);
      await visitDashboard(page, api, dashboard.id);

      // setup click behavior only with a temporal unit parameter
      await editDashboard(page);
      const card = getDashboardCard(page);
      await card.hover();
      await card.getByLabel("Click behavior").click({ force: true });
      await sidebar(page).getByText("Count", { exact: true }).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Saved question", { exact: true }).click();
      await modal(page)
        .getByText(nativeQuestionWithTextParameterDetails.name, { exact: true })
        .click();
      await expect(
        sidebar(page).getByText("No available targets", { exact: true }),
      ).toBeVisible();

      // setup click behavior with a text parameter
      await setFilter(page, "Text or Category");
      await dashboardParametersDoneButton(page).click();
      await card.hover();
      await card.getByLabel("Click behavior").click({ force: true });
      await sidebar(page).getByText(/Count goes to/).click();
      await sidebar(page)
        .getByText("Go to a custom destination", { exact: true })
        .click();
      await sidebar(page).getByText("Category", { exact: true }).click();
      await expect(popover(page).getByText("Text", { exact: true })).toBeVisible();
      await expect(
        popover(page).getByText(parameterDetails.name, { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("auto-wiring", () => {
    test("should not auto-wire to cards without breakout columns", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const { dashboard } = await createDashboardWithQuestions(api, {
        dashboardDetails,
        questions: [noBreakoutQuestionDetails, singleBreakoutQuestionDetails],
      });
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);

      // new mapping
      await selectDashboardFilter(getDashboardCard(page, 1), "Created At");
      await expect(undoToast(page)).toHaveCount(0);

      // new card
      await addQuestion(page, noBreakoutQuestionDetails.name);
      await expect(undoToast(page)).toHaveCount(0);
    });

    test("should auto-wire to cards with breakouts on column selection", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const { dashboard } = await createDashboardWithQuestions(api, {
        dashboardDetails,
        questions: [
          noBreakoutQuestionDetails,
          singleBreakoutQuestionDetails,
          multiBreakoutQuestionDetails,
        ],
      });
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);

      await selectDashboardFilter(getDashboardCard(page, 1), "Created At");
      await undoToast(page).getByRole("button", { name: "Auto-connect" }).click();
      await saveDashboard(page);

      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page, 1).getByText("Created At: Year", { exact: true }),
      ).toBeAttached();
      await expect(
        getDashboardCard(page, 2).getByText("Created At: Year", { exact: true }),
      ).toBeAttached();
    });

    test("should auto-wire to cards with breakouts after a new card is added", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      await api.createQuestion(multiBreakoutQuestionDetails);
      const { dashboard } = await createDashboardWithQuestions(api, {
        dashboardDetails,
        questions: [noBreakoutQuestionDetails, singleBreakoutQuestionDetails],
      });
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);

      await selectDashboardFilter(getDashboardCard(page, 1), "Created At");
      await expect(undoToast(page)).toHaveCount(0);
      await addQuestion(page, multiBreakoutQuestionDetails.name);
      await undoToast(page).getByRole("button", { name: "Auto-connect" }).click();
      await saveDashboard(page);

      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page, 1).getByText("Created At: Year", { exact: true }),
      ).toBeAttached();
      await expect(
        getDashboardCard(page, 2).getByText("Created At: Year", { exact: true }),
      ).toBeAttached();
    });

    test("should not overwrite parameter mappings for a card when doing auto-wiring", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const { dashboard } = await createDashboardWithQuestions(api, {
        dashboardDetails,
        questions: [
          noBreakoutQuestionDetails,
          singleBreakoutQuestionDetails,
          multiBreakoutQuestionDetails,
        ],
      });
      await visitDashboard(page, api, dashboard.id);
      await expect(
        getDashboardCard(page, 1).getByText("199", { exact: true }),
      ).toHaveCount(0);
      await editDashboard(page);

      // add a regular parameter
      await setFilter(page, "Text or Category", "Is");
      await selectDashboardFilter(getDashboardCard(page, 0), "Category");
      await undoToast(page).getByRole("button", { name: "Auto-connect" }).click();

      // add a temporal unit parameter
      await addTemporalUnitParameter(page);
      await selectDashboardFilter(getDashboardCard(page, 1), "Created At");
      await undoToastList(page)
        .last()
        .getByText("Auto-connect", { exact: true })
        .click();
      await saveDashboard(page);

      // verify data with 2 parameters
      await filterWidget(page).nth(0).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByRole("button", { name: "Add filter" }).click();
      await filterWidget(page).nth(1).click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page, 1).getByText("199", { exact: true }),
      ).toBeAttached(); // sample filtered data
      await expect(
        getDashboardCard(page, 1).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();

      // verify data without the first parameter
      await clearFilterWidget(page, 0);
      await expect(
        getDashboardCard(page, 1).getByText("199", { exact: true }),
      ).toHaveCount(0); // sample filtered data
      await expect(
        getDashboardCard(page, 1).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("parameter settings", () => {
    test("should be able to set available temporal units", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      await visitDashboard(page, api, dashboard.id);

      await editDashboard(page);
      await editParameter(page, parameterDetails.name);
      await dashboardParameterSidebar(page).getByText("All", { exact: true }).click();
      await popover(page).getByText("Select all", { exact: true }).click();
      await popover(page).getByText("Month", { exact: true }).click();
      await popover(page).getByText("Year", { exact: true }).click();
      await dashboardParametersDoneButton(page).click();
      await saveDashboard(page);

      await filterWidget(page).first().click();
      await expect(popover(page).getByText("Day", { exact: true })).toHaveCount(0);
      await expect(popover(page).getByText("Month", { exact: true })).toBeVisible();
      await expect(popover(page).getByText("Year", { exact: true })).toBeVisible();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });

    test("should clear the default value if it is no longer within the allowed unit list", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      await visitDashboard(page, api, dashboard.id);

      // set the default value
      await editDashboard(page);
      await editParameter(page, parameterDetails.name);
      await dashboardParameterSidebar(page)
        .getByText("No default", { exact: true })
        .click();
      await popover(page).getByText("Year", { exact: true }).click();

      // exclude an unrelated temporal unit
      await dashboardParameterSidebar(page).getByText("All", { exact: true }).click();
      await popover(page).getByText("Month", { exact: true }).click();
      await expect(
        dashboardParameterSidebar(page).getByText("No default", { exact: true }),
      ).toHaveCount(0);

      // exclude the temporal unit used for the default value
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        dashboardParameterSidebar(page).getByText("No default", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to set the default value and make it required", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      const dashboardId = dashboard.id;
      await visitDashboard(page, api, dashboardId);

      // set the default value
      await editDashboard(page);
      await editParameter(page, parameterDetails.name);
      await dashboardParameterSidebar(page)
        .getByText("No default", { exact: true })
        .click();
      await popover(page).getByText("Year", { exact: true }).click();
      await saveDashboard(page);
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();

      // clear the default value
      await clearFilterWidget(page);
      await expect(
        getDashboardCard(page).getByText("Created At: Month", { exact: true }),
      ).toBeVisible();

      // reload the dashboard and check the default value is applied
      await visitDashboard(page, api, dashboardId);
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();

      // make the parameter required
      await editDashboard(page);
      await editParameter(page, parameterDetails.name);
      await dashboardParameterSidebar(page)
        .getByText("Always require a value", { exact: true })
        .click();
      await saveDashboard(page);

      // change the parameter value and reset it to the default value
      await filterWidget(page).first().click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Quarter", { exact: true }),
      ).toBeVisible();
      await resetFilterWidgetToDefault(page);
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });

    test("should show an error message when an incompatible temporal unit is used", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      // setup dashboard with a time column
      const card = await createNativeQuestion(api, nativeTimeQuestionDetails);
      const { dashboard } = await createDashboardWithQuestions(api, {
        questions: [getNativeTimeQuestionBasedQuestionDetails(card)],
      });
      await visitDashboard(page, api, dashboard.id);
      await editDashboard(page);
      await addTemporalUnitParameter(page);
      await selectDashboardFilter(getDashboardCard(page), "TIME");
      await saveDashboard(page);

      // use an invalid temporal unit
      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(getDashboardCard(page)).toContainText(
        "This chart can not be broken out by the selected unit of time: year.",
      );

      // use a valid temporal unit
      await filterWidget(page).first().click();
      await popover(page).getByText("Minute", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("TIME: Minute", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("query string parameters", () => {
    test("should be able to parse the parameter value from the url", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      await visitDashboardWithParams(page, api, dashboard.id, {
        unit_of_time: "year",
      });
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });

    test("should ignore invalid temporal unit values from the url", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      await visitDashboardWithParams(page, api, dashboard.id, {
        unit_of_time: "invalid",
      });
      await expect(
        filterWidget(page).getByText(parameterDetails.name, { exact: true }),
      ).toBeVisible();
      await expect(filterWidget(page).getByText(/invalid/i)).toHaveCount(0);
      await expect(
        getDashboardCard(page).getByText("Created At: Month", { exact: true }),
      ).toBeVisible();
    });

    test("should accept temporal units outside of the allowlist if they are otherwise valid values from the url", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api, {
        dashboardDetails: {
          parameters: [
            {
              ...parameterDetails,
              temporal_units: ["month", "quarter"],
            },
          ],
        },
      });
      await visitDashboardWithParams(page, api, dashboard.id, {
        unit_of_time: "year",
      });
      await expect(
        filterWidget(page).getByText("Year", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("permissions", () => {
    test("should add a temporal unit parameter and connect it to a card and drill thru", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      await mb.signIn("nodata");
      await visitDashboard(page, api, dashboard.id);
      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
      await getDashboardCard(page)
        .getByText(singleBreakoutQuestionDetails.name, { exact: true })
        .click();
      await expect(
        tableInteractive(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("embedding", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
      await mb.api.updateSetting("enable-public-sharing", true);
    });

    test("should be able to use temporal unit parameters in a public dashboard", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api);
      const response = await api.post(
        `/api/dashboard/${dashboard.id}/public_link`,
      );
      const { uuid } = (await response.json()) as { uuid: string };
      await mb.signOut();
      await page.goto(`/public/dashboard/${uuid}`);

      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to use temporal unit parameters in a embedded dashboard", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const dashboard = await createDashboardWithMappedQuestion(api, {
        dashboardDetails: {
          enable_embedding: true,
          embedding_params: {
            [parameterDetails.slug]: "enabled",
          },
        },
      });
      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboard.id },
        params: {},
      });

      await filterWidget(page).first().click();
      await popover(page).getByText("Year", { exact: true }).click();
      await expect(
        getDashboardCard(page).getByText("Created At: Year", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("native queries", () => {
    test("should be able to use temporal unit parameters in a native query", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const { dashboard } = await createDashboardWithQuestions(api, {
        dashboardDetails,
        questions: [questionWithoutDefaultValue],
      });
      await visitDashboard(page, api, dashboard.id);

      await expect(getDashboardCard(page)).toContainText(
        "There was a problem displaying this chart.",
      );

      await editDashboard(page);
      await addTemporalUnitParameter(page);
      await selectDashboardFilter(getDashboardCard(page), "Unit");

      await dashboardParameterSidebar(page).getByLabel("Default value").click();

      await popover(page).getByText("Year", { exact: true }).click();
      await saveDashboard(page);
      await expect(getDashboardCard(page)).toContainText("January 1, 2025");
    });

    test("should not be able to use temporal unit parameter with a filter of a different type", async ({
      page,
      mb,
    }) => {
      const api = mb.api;
      const { dashboard } = await createDashboardWithQuestions(api, {
        dashboardDetails,
        questions: [questionWithoutDefaultValue],
      });
      await visitDashboard(page, api, dashboard.id);

      await expect(getDashboardCard(page)).toContainText(
        "There was a problem displaying this chart.",
      );

      await editDashboard(page);

      await setFilter(page, "Text or Category", "Is");
      await expect(getDashboardCard(page)).toContainText(
        "A text variable in this card can only be connected to a text filter with Is operator.",
      );
      await expect(getDashboardCard(page)).not.toContainText("Select…");

      await setFilter(page, "Number", "Equal to");
      await expect(getDashboardCard(page)).toContainText(
        "A number variable in this card can only be connected to a number filter with Equal to operator.",
      );
      await expect(getDashboardCard(page)).not.toContainText("Select…");

      await setFilter(page, "Date picker", "Relative Date");
      await expect(getDashboardCard(page)).toContainText(
        "A date variable in this card can only be connected to a time type with the single date option.",
      );
      await expect(getDashboardCard(page)).not.toContainText("Select…");

      await setFilter(page, "Location", "Is");
      await expect(getDashboardCard(page)).toContainText(
        "Add a variable to this question to connect it to a dashboard filter.",
      );
      await expect(getDashboardCard(page)).not.toContainText("Select…");
    });
  });
});
