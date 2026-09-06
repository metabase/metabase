/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filter-defaults.cy.spec.ts
 *
 * (Upstream describe is named "reset", but the file is about dashboard-filter
 * DEFAULT values: editing/removing a filter's default and how the URL query
 * params and widget display track it.)
 *
 * Ports:
 *  - filterWidget({ name, isEditing }) / clearFilterWidget → dashboard-parameters
 *  - editDashboard / saveDashboard / sidebar → dashboard
 *  - createQuestionAndDashboard → factories; editDashboardCard,
 *    visitDashboardWithParams → filters-repros
 *  - the two spec-local default-value helpers (clearDefaultFilterValue /
 *    setDefaultFilterValue) → support/dashboard-filter-defaults
 *
 * `cy.location("search").should("eq", …)` was retried by Cypress, so it becomes
 * an `expect.poll` on the URL search (a one-shot check catches transient states
 * while the FE reconciles the default into the query string — PORTING).
 * `H.filterWidget().contains(x)` is Cypress first-match / case-sensitive
 * substring → filterWidget(page, { name: x }) (regex-substring), `.first()` on
 * the editing-widget click to mirror `.contains`'s first-match.
 */
import type { Page } from "@playwright/test";

import { editDashboard, saveDashboard, sidebar } from "../support/dashboard";
import {
  clearDefaultFilterValue,
  setDefaultFilterValue,
} from "../support/dashboard-filter-defaults";
import {
  clearFilterWidget,
  filterWidget,
} from "../support/dashboard-parameters";
import { createQuestionAndDashboard } from "../support/factories";
import {
  editDashboardCard,
  visitDashboardWithParams,
} from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const QUESTION = {
  name: "Return input value",
  display: "scalar" as const,
  query: {
    "source-table": PRODUCTS_ID,
  },
};

const FILTER_ONE = {
  name: "Filter One",
  slug: "filter_one",
  id: "904aa8b7",
  type: "string/=",
  sectionId: "string",
  default: undefined,
};

const FILTER_TWO = {
  name: "Filter Two",
  slug: "filter_two",
  id: "904aa8b8",
  type: "string/=",
  sectionId: "string",
  default: "Bar",
};

const DASHBOARD = {
  name: "Filters Dashboard",
  parameters: [FILTER_ONE, FILTER_TWO],
};

function search(page: Page): string {
  return new URL(page.url()).search;
}

test.describe("scenarios > dashboard > filters > reset", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should reset a filters value when editing the default", async ({
    page,
    mb,
  }) => {
    const dashboardCard = await createQuestionAndDashboard(mb.api, {
      questionDetails: QUESTION,
      dashboardDetails: DASHBOARD,
    });
    const { card_id, dashboard_id } = dashboardCard;

    await editDashboardCard(mb.api, dashboardCard, {
      parameter_mappings: [
        {
          parameter_id: FILTER_ONE.id,
          card_id,
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
        {
          parameter_id: FILTER_TWO.id,
          card_id,
          target: ["dimension", ["field", PRODUCTS.TITLE, null]],
        },
      ],
    });

    await visitDashboardWithParams(page, mb.api, dashboard_id, {
      filter_one: "",
      filter_two: "Bar",
    });

    // Default dashboard filter
    await expect(filterWidget(page, { name: "Filter One" })).toBeVisible();
    await expect(filterWidget(page, { name: "Bar" })).toBeVisible();

    await expect
      .poll(() => search(page))
      .toBe("?filter_one=&filter_two=Bar");

    await clearFilterWidget(page, 1);

    await expect.poll(() => search(page)).toBe("?filter_one=&filter_two=");

    // Finally, when we remove dashboard filter's default value, the url should
    // reflect that by removing the placeholder
    await editDashboard(page);

    await filterWidget(page, { name: "Filter Two", isEditing: true })
      .first()
      .click();

    await sidebar(page).getByLabel("Input box", { exact: true }).click();
    await clearDefaultFilterValue(page);

    await setDefaultFilterValue(page, "Foo");

    await expect.poll(() => search(page)).toBe("?filter_one=&filter_two=Foo");

    await saveDashboard(page);

    await expect.poll(() => search(page)).toBe("?filter_one=&filter_two=Foo");

    await expect(filterWidget(page, { name: "Filter One" })).toBeVisible();
    await expect(filterWidget(page, { name: "Foo" })).toBeVisible();
  });

  test("should reset a filters value when editing the default, and leave other filters alone", async ({
    page,
    mb,
  }) => {
    const dashboardCard = await createQuestionAndDashboard(mb.api, {
      questionDetails: QUESTION,
      dashboardDetails: DASHBOARD,
    });
    const { card_id, dashboard_id } = dashboardCard;

    await editDashboardCard(mb.api, dashboardCard, {
      parameter_mappings: [
        {
          parameter_id: FILTER_ONE.id,
          card_id,
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
        {
          parameter_id: FILTER_TWO.id,
          card_id,
          target: ["dimension", ["field", PRODUCTS.TITLE, null]],
        },
      ],
    });

    await visitDashboardWithParams(page, mb.api, dashboard_id, {
      filter_one: "",
      filter_two: "Bar",
    });

    // Default dashboard filter
    await expect(filterWidget(page, { name: "Filter One" })).toBeVisible();
    await expect(filterWidget(page, { name: "Bar" })).toBeVisible();

    await expect
      .poll(() => search(page))
      .toBe("?filter_one=&filter_two=Bar");

    // Finally, when we remove dashboard filter's default value, the url should
    // reflect that by removing the placeholder
    await editDashboard(page);

    await filterWidget(page, { name: "Filter One", isEditing: true })
      .first()
      .click();

    await sidebar(page).getByLabel("Input box", { exact: true }).click();

    await setDefaultFilterValue(page, "Foo");

    await expect
      .poll(() => search(page))
      .toBe("?filter_one=Foo&filter_two=Bar");

    await saveDashboard(page);

    await expect
      .poll(() => search(page))
      .toBe("?filter_one=Foo&filter_two=Bar");

    await expect(filterWidget(page, { name: "Filter One" })).toBeVisible();
    await expect(filterWidget(page, { name: "Foo" })).toBeVisible();
  });
});
