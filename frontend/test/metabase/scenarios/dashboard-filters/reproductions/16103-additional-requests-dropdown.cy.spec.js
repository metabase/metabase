import {
  restore,
  expectedRouteCalls,
  filterWidget,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, PRODUCTS } = SAMPLE_DATASET;

const filter = {
  id: "d7988e02",
  name: "Category",
  slug: "category",
  type: "category",
};

describe.skip("issue 16103", () => {
  beforeEach(() => {
    cy.server();
    cy.route(`/api/dashboard/1/params/${filter.id}/values`).as("fetchFromDB");

    restore();
    cy.signInAsAdmin();
  });

  it("filter dropdown should not send request for values every time the widget is opened (metabase#16103)", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    cy.addFilterToDashboard({ filter, dashboard_id: 1 });

    cy.log("Connect filter to the existing card");
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          sizeX: 12,
          sizeY: 8,
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id: 1,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    cy.visit("/dashboard/1");

    filterWidget().click();
    expectedRouteCalls({ route_alias: "fetchFromDB", calls: 1 });

    // Make sure all filters were fetched (should be cached after this)
    ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach(category => {
      cy.findByText(category);
    });

    // Get rid of the popover
    cy.findByText("Orders in a dashboard").click();

    cy.log(
      "Clicking on the filter again should NOT send another query to the source DB again! Results should have been cached by now.",
    );
    filterWidget().click();
    expectedRouteCalls({ route_alias: "fetchFromDB", calls: 1 });
  });
});
