import { restore, filterWidget, visitDashboard } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "13960",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  display: "pie",
};

const filterWithDefaultValue = {
  name: "Category",
  slug: "category",
  id: "c32a49e1",
  type: "category",
  default: ["Doohickey"],
};

const filter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

const dashboardDetails = {
  parameters: [filterWithDefaultValue, filter],
};

describe("issue 13960", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not preserve cleared filter with the default value on refresh (metabase#13960)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { card_id, dashboard_id } = dashboardCard;

        const mapFiltersToCard = {
          parameter_mappings: [
            {
              parameter_id: filterWithDefaultValue.id,
              card_id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
            {
              parameter_id: filter.id,
              card_id,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
          ],
        };

        cy.editDashboardCard(dashboardCard, mapFiltersToCard);

        visitDashboard(dashboard_id);
      },
    );

    cy.location("search").should("eq", "?category=Doohickey");

    // Remove default filter (category)
    cy.get("fieldset .Icon-close").click();

    cy.url().should("not.include", "?category=Doohickey");

    // Set filter value to the `ID`
    filterWidget()
      .contains(/ID/i)
      .click();

    cy.findByPlaceholderText("Enter an ID").type("1");

    cy.button("Add filter")
      .should("not.be.disabled")
      .click();

    cy.location("search").should("eq", "?category=&id=1");

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.reload();
    cy.wait("@dashcardQuery");

    cy.findByText("13960");
    cy.findAllByText("Doohickey").should("not.exist");

    cy.location("search").should("eq", "?category=&id=1");
  });
});
