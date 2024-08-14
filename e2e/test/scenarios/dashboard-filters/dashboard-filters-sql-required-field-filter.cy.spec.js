import { produce } from "immer";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  clearFilterWidget,
  filterWidget,
  visitDashboard,
} from "e2e/support/helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "SQL products category, required, 2 selections",
  native: {
    query: "select distinct category from PRODUCTS where {{filter}}",
    "template-tags": {
      filter: {
        id: "e33dc805-6b71-99a5-ee14-128383953986",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "category",
        default: ["Gizmo", "Gadget"],
        required: false,
      },
    },
  },
};

const questionDetailsWithRequiredFilter = produce(questionDetails, draft => {
  draft.native["template-tags"].filter.required = true;
});

const filter = {
  name: "Category",
  slug: "category",
  id: "49fcc65c",
  type: "category",
  default: "Widget",
};

const dashboardDetails = {
  name: "Required Filters Dashboard",
  parameters: [filter],
};

describe("scenarios > dashboard > filters > SQL > field filter > required ", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should apply default of the SQL field filter if the dashboard doesn't have a filter connected to it", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashboardCard }) => {
      const { dashboard_id } = dashboardCard;
      visitDashboard(dashboard_id);
    });

    // the native SQL filter is not mapped to the dashcard filter
    // the results should show the default value was applied
    cy.findByTestId("dashcard").within(() => {
      cy.findByText("Gizmo");
      cy.contains("Widget").should("not.exist");
    });
  });

  it("should apply default of the SQL field filter if the dashboard filter is empty", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashboardCard }) => {
      const { card_id, dashboard_id } = dashboardCard;
      const mapFilterToCard = {
        parameter_mappings: [
          {
            parameter_id: filter.id,
            card_id,
            target: ["dimension", ["template-tag", "filter"]],
          },
        ],
      };
      cy.editDashboardCard(dashboardCard, mapFilterToCard);
      visitDashboard(dashboard_id);
    });

    clearFilterWidget();

    // the results should show that the field filter was not applied
    cy.findByTestId("dashcard").within(() => {
      cy.findByText("Doohickey");
    });
  });

  it("should respect default filter precedence (dashboard filter, then SQL field filters)", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails: questionDetailsWithRequiredFilter,
      dashboardDetails,
    }).then(({ body: dashboardCard }) => {
      const { card_id, dashboard_id } = dashboardCard;
      const mapFilterToCard = {
        parameter_mappings: [
          {
            parameter_id: filter.id,
            card_id,
            target: ["dimension", ["template-tag", "filter"]],
          },
        ],
      };
      cy.editDashboardCard(dashboardCard, mapFilterToCard);
      visitDashboard(dashboard_id);
    });

    // Default dashboard filter
    cy.location("search").should("eq", "?category=Widget");

    cy.findByTestId("dashcard").as("dashboardCard").contains("Widget");

    filterWidget().contains("Widget");

    clearFilterWidget();

    cy.location("search").should("eq", "?category=");

    // The default shouldn't apply, so we should get an error
    cy.findByTestId("dashcard").contains(
      "There was a problem displaying this chart.",
    );

    // The empty filter widget
    filterWidget().contains("Category");

    cy.reload();

    // This part confirms that the issue metabase#13960 has been fixed
    cy.location("search").should("eq", "?category=");
    cy.findByTestId("dashcard").contains(
      "There was a problem displaying this chart.",
    );

    // Let's make sure the default dashboard filter is respected upon a subsequent visit from the root
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Required Filters Dashboard").click();

    cy.location("search").should("eq", "?category=Widget");
  });
});
