/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/click-behavior-reproductions.cy.spec.ts
 *
 * A reproductions grab-bag: each describe is an independent bug (issue number
 * preserved). Notes vs the original:
 * - `cy.wrap(dashboardId).as("dashboardId")` / `cy.location(...).as(...)` become
 *   plain local variables.
 * - `H.createQuestionAndDashboard(...).then(({ body: card, questionId }))` — the
 *   `body` is the DASHCARD, so `card.id` is the dashcard id, `card.dashboard_id`
 *   the dashboard id, `questionId`/`card_id` the card id. The shared factory
 *   returns all of those on one object.
 * - `cy.get(H.POPOVER_ELEMENT).should("not.exist")` → `popover(page)` count 0.
 * - Retried `cy.location(...).should(...)` → expect.poll (one-shot URL checks
 *   catch transient states — PORTING.md).
 */
import type { MetabaseApi } from "../support/api";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  createMockActionParameter,
  type MockActionParameter,
} from "../support/click-behavior-reproductions";
import { chartPathWithFillColor } from "../support/binning";
import {
  createQuestionAndDashboard,
  type StructuredQuestionDetails,
} from "../support/factories";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { clickBehaviorSidebar } from "../support/dashboard-repros";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
} from "../support/dashboard";
import { expectFilterWidgets } from "../support/click-behavior";
import { assertTableRowsCount } from "../support/native-extras";
import { popover, visitDashboard } from "../support/ui";
import { test, expect } from "../support/fixtures";

const { PRODUCTS_ID, PRODUCTS, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

test.describe("issue 59049", () => {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const categoryParameter = {
    id: "1b9cd9f1",
    name: "Category",
    slug: "category",
    type: "string/=",
    sectionId: "string",
  };

  const vendorParameter = {
    id: "1b9cd9f2",
    name: "Vendor",
    slug: "vendor",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [categoryParameter, vendorParameter],
  };

  async function createDashboard(api: MetabaseApi) {
    const card = await createQuestionAndDashboard(api, {
      questionDetails,
      dashboardDetails,
    });
    await addOrUpdateDashboardCard(api, {
      dashboard_id: card.dashboard_id,
      card_id: card.questionId,
      card: {
        id: card.id,
        parameter_mappings: [
          {
            card_id: card.questionId,
            parameter_id: categoryParameter.id,
            target: [
              "dimension",
              ["field", PRODUCTS.CATEGORY, null],
              { "stage-number": 0 },
            ],
          },
          {
            card_id: card.questionId,
            parameter_id: vendorParameter.id,
            target: [
              "dimension",
              ["field", PRODUCTS.VENDOR, null],
              { "stage-number": 0 },
            ],
          },
        ],
        visualization_settings: {
          column_settings: {
            '["name","CATEGORY"]': {
              click_behavior: {
                parameterMapping: {
                  [categoryParameter.id]: {
                    id: categoryParameter.id,
                    source: {
                      type: "column",
                      id: "CATEGORY",
                      name: "Category",
                    },
                    target: {
                      type: "parameter",
                      id: categoryParameter.id,
                    },
                  },
                  [vendorParameter.id]: {
                    id: vendorParameter.id,
                    source: {
                      type: "column",
                      id: "VENDOR",
                      name: "Vendor",
                    },
                    target: {
                      type: "parameter",
                      id: vendorParameter.id,
                    },
                  },
                },
                type: "crossfilter",
              },
            },
          },
        },
      },
    });
    return card.dashboard_id;
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not reset parameter values in click behaviors when they are partially equal to the new values (metabase#59049)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    // when not all old parameter values are equal to new values, do not reset
    await filterWidget(page).first().click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await assertTableRowsCount(page, 53);
    await getDashboardCard(page)
      .getByText("Gadget", { exact: true })
      .first()
      .click();
    await expect(filterWidget(page).nth(0)).toContainText("Gadget");
    await expect(filterWidget(page).nth(1)).toContainText(
      "Price, Schultz and Daniel",
    );
    await assertTableRowsCount(page, 1);

    // when all old parameter values are equal to new values, reset
    await getDashboardCard(page)
      .getByText("Gadget", { exact: true })
      .first()
      .click();
    await expect(filterWidget(page).nth(0)).not.toContainText("Gadget");
    await expect(filterWidget(page).nth(1)).not.toContainText(
      "Price, Schultz and Daniel",
    );
    await assertTableRowsCount(page, 200);
  });
});

test.describe("issue 64368", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should reset to default value when unsetting a required filter with a default through click behavior (metabase#64368)", async ({
    page,
    mb,
  }) => {
    const DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT = createMockActionParameter({
      id: "5",
      name: "Required Filter",
      slug: "required-filter",
      type: "string/=",
      sectionId: "string",
      default: "Doohickey",
      required: true,
    });

    const testQuestionDetails: StructuredQuestionDetails = {
      name: "Orders by Category",
      display: "table",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
        limit: 5,
      },
    };

    const dashboardDetails = {
      parameters: [DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT],
    };

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: testQuestionDetails,
      dashboardDetails,
    });
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: {
        parameter_mappings: [
          {
            card_id: dashcard.card_id,
            parameter_id: DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT.id,
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CATEGORY,
                {
                  "base-type": "type/Text",
                  "source-field": ORDERS.PRODUCT_ID,
                },
              ],
            ],
          },
        ],
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    // Verify initial state with default filter value
    await expectFilterWidgets(page, 1, "Doohickey");

    // Configure click behavior to update dashboard filter
    await editDashboard(page);

    const sidebar = await clickBehaviorSidebar(page);
    await sidebar.getByText("Product → Category", { exact: true }).click();
    await sidebar.getByText("Update a dashboard filter", { exact: true }).click();
    await sidebar
      .getByText(DASHBOARD_FILTER_REQUIRED_WITH_DEFAULT.name as string, {
        exact: true,
      })
      .click();

    await popover(page)
      .getByText("Product → Category", { exact: true })
      .click();

    await sidebar.getByRole("button", { name: "Done" }).click();

    await saveDashboard(page);

    // Set dashboard filter to contain all values
    await filterWidget(page).click();
    await popover(page).getByText("Select all", { exact: true }).click();
    await popover(page).getByText("Update filter", { exact: true }).click();

    // Click on a category row to set filter value to Gadget
    await getDashboardCard(page).getByText("Gadget", { exact: true }).click();
    await expectFilterWidgets(page, 1, "Gadget");

    // Click same category again to unset - should reset to default value
    // Doohickey, not blank
    await getDashboardCard(page).getByText("Gadget", { exact: true }).click();
    await expectFilterWidgets(page, 1, "Doohickey");
  });
});

test.describe("issue 73448", () => {
  const productCategories = ["Doohickey", "Gadget", "Gizmo", "Widget"];

  const categoryParameter: MockActionParameter = createMockActionParameter({
    id: "category",
    name: "Category",
    slug: "category",
    type: "string/=",
    sectionId: "string",
  });

  const questionDetails: StructuredQuestionDetails = {
    name: "Orders by Category",
    display: "bar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          PRODUCTS.CATEGORY,
          { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
        ],
      ],
      limit: 5,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("updates a dashboard filter from a bar chart dimension click behavior (#73448)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails: {
        parameters: [categoryParameter],
      },
    });
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: {
        id: dashcard.id,
        parameter_mappings: [
          {
            card_id: dashcard.card_id,
            parameter_id: categoryParameter.id,
            target: [
              "dimension",
              [
                "field",
                PRODUCTS.CATEGORY,
                {
                  "base-type": "type/Text",
                  "source-field": ORDERS.PRODUCT_ID,
                },
              ],
            ],
          },
        ],
        visualization_settings: {
          column_settings: {
            '["name","CATEGORY"]': {
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  [categoryParameter.id]: {
                    id: categoryParameter.id,
                    source: {
                      type: "column",
                      id: "CATEGORY",
                      name: "Product → Category",
                    },
                    target: {
                      type: "parameter",
                      id: categoryParameter.id,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    const dashboardPath = new URL(page.url()).pathname;

    const bars = chartPathWithFillColor(page, "#509EE3");
    await expect(bars).toHaveCount(4);
    await bars.first().click();

    // dashboard filter updates with the clicked category value
    await expect
      .poll(async () => {
        const text = (await filterWidget(page).textContent()) ?? "";
        return productCategories.some((category) => text.includes(category));
      })
      .toBe(true);
    await expect
      .poll(() => {
        const category = new URLSearchParams(
          new URL(page.url()).search,
        ).get("category");
        return productCategories.includes(category ?? "");
      })
      .toBe(true);

    // drill-through popover is not shown and navigation stays put
    await expect(popover(page)).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe(dashboardPath);
  });
});
