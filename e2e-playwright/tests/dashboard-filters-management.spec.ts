/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-management.cy.spec.js
 *
 * Adding/reordering/removing dashboard filters, editing filter settings,
 * wiring to cards, and the filter-management sidebar.
 *
 * The spec-local flow functions (selectFilter, changeFilterType,
 * changeOperator, verifyOperatorValue, createDashboardWithFilterAndQuestionMapped)
 * live in support/dashboard-filters-management.ts. The Cypress
 * `findByDisplayValue(...).should("exist")` / `.click()` calls become the
 * retried expectSidebarHasDisplayValue / clickSidebarDisplayValue wrappers
 * there — the sidebar re-renders after a type change and a one-shot lookup
 * races it.
 */
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { updateDashboardCards } from "../support/dashboard-core";
import {
  changeFilterType,
  changeOperator,
  clickSidebarDisplayValue,
  createDashboardWithFilterAndQuestionMapped,
  expectSidebarHasDisplayValue,
  selectFilter,
  verifyOperatorValue,
} from "../support/dashboard-filters-management";
import { mockParameter } from "../support/dashboard-parameters";
import { createDashboardWithQuestions } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";
import { visitDashboard } from "../support/ui";

const { PEOPLE, PEOPLE_ID, ORDERS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > dashboard > filters > management", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("Disconnect from cards", () => {
    test("should reset existing filter mappings", async ({ page, mb }) => {
      const locationFilter = mockParameter({
        name: "Location",
        slug: "location",
        id: "5aefc725",
        type: "string/=",
        sectionId: "location",
      });

      const textFilter = mockParameter({
        name: "Text",
        slug: "string",
        id: "5aefc726",
        type: "string/=",
        sectionId: "string",
      });

      const peopleQuestionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };
      const ordersQuestionDetails = {
        query: { "source-table": ORDERS_ID, limit: 5 },
      };

      const { dashboard, questions: cards } =
        await createDashboardWithQuestions(mb.api, {
          dashboardDetails: {
            parameters: [locationFilter, textFilter],
          },
          questions: [peopleQuestionDetails, ordersQuestionDetails],
        });
      const [peopleCard, ordersCard] = cards;

      await updateDashboardCards(mb.api, {
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: locationFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.STATE, null]],
              },
              {
                parameter_id: textFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
            ],
          },
          {
            card_id: ordersCard.id,
            parameter_mappings: [
              {
                parameter_id: locationFilter.id,
                card_id: ordersCard.id,
                target: ["dimension", ["field", PEOPLE.CITY, null]],
              },
              {
                parameter_id: textFilter.id,
                card_id: ordersCard.id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
            ],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboard.id);

      // verify filters are there
      await expect(filterWidget(page).filter({ hasText: "Location" })).toBeVisible();
      await expect(filterWidget(page).filter({ hasText: "Text" })).toBeVisible();

      await editDashboard(page);

      await selectFilter(page, "Location");

      await expect(getDashboardCard(page)).toContainText("People.State");
      await expect(getDashboardCard(page, 1)).toContainText("User.City");

      // Disconnect cards
      await sidebar(page).getByText("Disconnect from cards", { exact: true }).click();

      await expect(getDashboardCard(page)).not.toContainText("People.State");
      await expect(getDashboardCard(page, 1)).not.toContainText("User.City");

      await selectFilter(page, "Text");

      await expect(getDashboardCard(page)).toContainText("People.Name");
      await expect(getDashboardCard(page, 1)).toContainText("User.Name");

      await saveDashboard(page);

      await expect(filterWidget(page).filter({ hasText: "Text" })).toBeVisible();
      await expect(
        filterWidget(page).filter({ hasText: "Location" }),
      ).toHaveCount(0);
    });
  });

  test.describe("change parameter type", () => {
    test("should reset existing filter mappings and default value", async ({
      page,
      mb,
    }) => {
      await createDashboardWithFilterAndQuestionMapped(page, mb.api);

      await selectFilter(page, "Text");

      await expect(getDashboardCard(page)).toContainText("People.Name");

      // change filter type
      // verifies default value presents
      await expect(
        sidebar(page).getByText("value to check default", { exact: true }),
      ).toBeVisible();
      await clickSidebarDisplayValue(page, "Text or Category");

      await popover(page).getByText("Number", { exact: true }).click();

      // verifies no default value
      await expect(
        sidebar(page).getByText("No default", { exact: true }),
      ).toBeVisible();
      await expect(getDashboardCard(page)).not.toContainText("People.Name");

      await saveDashboard(page);

      await expect(filterWidget(page)).toHaveCount(0);
    });

    test("should preselect default value for every type of filter", async ({
      page,
      mb,
    }) => {
      await createDashboardWithFilterAndQuestionMapped(page, mb.api);

      await selectFilter(page, "Text");

      // verify Text default value: Is
      await expectSidebarHasDisplayValue(page, "Is");

      await changeFilterType(page, "Number");

      // verify Number default value: Between
      await verifyOperatorValue(page, "Equal to");

      await changeFilterType(page, "ID");

      // verify ID default value: Numeric ID
      await verifyOperatorValue(page, "Numeric ID");

      await changeFilterType(page, "Date picker");

      // verify Date default value: All Options
      await verifyOperatorValue(page, "All Options");

      await changeFilterType(page, "Location");

      // verify Date default value: Is
      await verifyOperatorValue(page, "Is");
    });

    test("should use saved parameter value when user switches back to the saved filter type", async ({
      page,
      mb,
    }) => {
      const textFilter = mockParameter({
        name: "Text Text",
        slug: "string",
        id: "5aefc726",
        type: "string/does-not-contain",
        sectionId: "string",
      });

      const peopleQuestionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };

      const { dashboard, questions: cards } =
        await createDashboardWithQuestions(mb.api, {
          dashboardDetails: {
            parameters: [textFilter],
          },
          questions: [peopleQuestionDetails],
        });
      const [peopleCard] = cards;

      await updateDashboardCards(mb.api, {
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
            ],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboard.id);

      await editDashboard(page);

      await selectFilter(page, "Text Text");

      await expectSidebarHasDisplayValue(page, "Does not contain");

      await changeFilterType(page, "Number");

      // default value for a number type
      await expectSidebarHasDisplayValue(page, "Equal to");

      await changeFilterType(page, "Text or Category");

      // verify the saved parameter value is restored
      await expectSidebarHasDisplayValue(page, "Does not contain");
      await expectSidebarHasDisplayValue(page, "Text or Category");
      await expectSidebarHasDisplayValue(page, "Text Text");
    });

    test("should restore parameter mappings when user switches back to the saved parameter type", async ({
      page,
      mb,
    }) => {
      const textFilter = mockParameter({
        name: "Text Text",
        slug: "string",
        id: "5aefc726",
        type: "string/does-not-contain",
        sectionId: "string",
      });

      const peopleQuestionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };

      const { dashboard, questions: cards } =
        await createDashboardWithQuestions(mb.api, {
          dashboardDetails: {
            parameters: [textFilter],
          },
          questions: [peopleQuestionDetails],
        });
      const [peopleCard] = cards;

      await updateDashboardCards(mb.api, {
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
            ],
          },
        ],
      });

      await visitDashboard(page, mb.api, dashboard.id);

      await editDashboard(page);

      await selectFilter(page, "Text Text");

      await expectSidebarHasDisplayValue(page, "Does not contain");

      await expect(getDashboardCard(page)).toContainText("People.Name");

      await changeFilterType(page, "Number");

      // verify that mapping is cleared
      await expect(getDashboardCard(page)).not.toContainText("People.Name");

      await changeFilterType(page, "Text or Category");

      // verify that mapping is restored
      await expect(getDashboardCard(page)).toContainText("People.Name");
    });
  });

  test.describe("change parameter operator", () => {
    test("should not reset filter mappings, but reset default value", async ({
      page,
      mb,
    }) => {
      await createDashboardWithFilterAndQuestionMapped(page, mb.api);

      await selectFilter(page, "Text");

      // verifies default value is there
      await expect(
        sidebar(page).getByText("value to check default", { exact: true }),
      ).toBeVisible();

      await expect(getDashboardCard(page)).toContainText("People.Name");

      await changeOperator(page, "Contains");

      await expect(getDashboardCard(page)).toContainText("People.Name");

      // verifies default value does not exist
      await expect(
        sidebar(page).getByText("No default", { exact: true }),
      ).toBeVisible();

      await saveDashboard(page);

      await expect(filterWidget(page).filter({ hasText: "Text" })).toBeVisible();
    });
  });
});
