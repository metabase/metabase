/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-required-simple-filter.cy.spec.js
 *
 * A SQL question with a REQUIRED simple text template-tag ({{filter}}, default
 * "Foo") connected to a dashboard text filter (string/=, default "Bar"). The
 * spec exercises default-value precedence between the two and the URL updates at
 * each step.
 *
 * Fixture data + the create-and-connect setup are ported from the Cypress
 * spec's beforeEach; everything else the spec needs (filterWidget /
 * clearFilterWidget / editDashboard / saveDashboard / sidebar / visitDashboard /
 * findByDisplayValue / icon) is imported read-only from the shared modules.
 */
import type { Locator, Page } from "@playwright/test";

import { sidebar } from "./dashboard";
import {
  createNativeQuestionAndDashboard,
  type DashboardDetails,
  type NativeQuestionDetails,
} from "./factories";
import { findByDisplayValue } from "./filters-repros";
import { icon } from "./ui";

import type { MetabaseApi } from "./api";

export const questionDetails: NativeQuestionDetails = {
  name: "Return input value",
  native: {
    query: "select {{filter}}",
    "template-tags": {
      filter: {
        id: "7182a24e-163a-099c-b085-156f0879aaec",
        name: "filter",
        "display-name": "Filter",
        type: "text",
        required: true,
        default: "Foo",
      },
    },
  },
  display: "scalar",
};

export const filter = {
  name: "Text",
  slug: "text",
  id: "904aa8b7",
  type: "string/=",
  sectionId: "string",
  default: "Bar",
};

export const dashboardDetails: DashboardDetails = {
  name: "Required Filters Dashboard",
  parameters: [filter],
};

/**
 * Port of the Cypress beforeEach body: create the native question + dashboard,
 * then map the dashboard filter to the SQL template tag via a follow-up PUT
 * (H.editDashboardCard merges the parameter_mappings onto the existing
 * dashcard). Keeps the factory's default 11x6 layout. Returns the dashboard id.
 */
export async function setupRequiredSimpleFilterDashboard(
  api: MetabaseApi,
): Promise<number> {
  const { id, card_id, dashboard_id } = await createNativeQuestionAndDashboard(
    api,
    { questionDetails, dashboardDetails },
  );

  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 11,
        size_y: 6,
        parameter_mappings: [
          {
            parameter_id: filter.id,
            card_id,
            target: ["variable", ["template-tag", "filter"]],
          },
        ],
      },
    ],
  });

  return dashboard_id;
}

/**
 * Port of the spec-local removeDefaultFilterValue:
 * `cy.findByDisplayValue(value).parent().find(".Icon-close").click()`, scoped to
 * the sidebar (the Cypress call runs inside `H.sidebar().within(...)`).
 */
export async function removeDefaultFilterValue(page: Page, value: string) {
  const control: Locator = await findByDisplayValue(sidebar(page), value);
  await icon(control.locator(".."), "close").click();
}
