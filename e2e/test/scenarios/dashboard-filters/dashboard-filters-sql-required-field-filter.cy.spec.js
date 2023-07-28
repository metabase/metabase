import { restore, filterWidget, visitDashboard } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "SQL products category, required, 2 selections",
  native: {
    query: "select * from PRODUCTS where {{filter}}",
    "template-tags": {
      filter: {
        id: "e33dc805-6b71-99a5-ee14-128383953986",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "category",
        default: ["Gizmo", "Gadget"],
        required: true,
      },
    },
  },
};

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
  });

  it("should respect default filter precedence (dashboard filter, then SQL field filters)", () => {
    // Default dashboard filter
    cy.location("search").should("eq", "?category=Widget");

    cy.get(".Card").as("dashboardCard").contains("Widget");

    filterWidget().contains("Widget");

    removeWidgetFilterValue();

    cy.location("search").should("eq", "?category=");

    // SQL question defaults
    cy.get("@dashboardCard").within(() => {
      cy.findAllByText("Gizmo");
      cy.findAllByText("Gadget");
    });

    // The empty filter widget
    filterWidget().contains("Category");

    cy.reload();

    // This part confirms that the issue metabase#13960 has been fixed
    cy.location("search").should("eq", "?category=");

    cy.get("@dashboardCard").within(() => {
      cy.findAllByText("Gizmo");
      cy.findAllByText("Gadget");
    });

    // Let's make sure the default dashboard filter is respected upon a subsequent visit from the root
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Required Filters Dashboard").click();

    cy.location("search").should("eq", "?category=Widget");
  });
});

function removeWidgetFilterValue() {
  filterWidget().find(".Icon-close").click();
}
