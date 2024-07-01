import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, filterWidget, visitDashboard } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Orders join Products",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field-id", ORDERS.PRODUCT_ID],
          ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
        ],
        alias: "Products",
      },
    ],
    limit: 5,
  },
};

const filter = {
  name: "Text",
  slug: "text",
  id: "7653fdfa",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [filter],
};

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    cy.intercept("GET", `/api/dashboard/*/params/${filter.id}/values`).as(
      "filterValues",
    );

    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { card_id, dashboard_id } = dashboardCard;

        const updatedCardDetails = {
          size_x: 21,
          size_y: 10,
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.TITLE,
                  {
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        };

        cy.editDashboardCard(dashboardCard, updatedCardDetails);

        visitDashboard(dashboard_id);
      },
    );
  });

  it("should work properly when connected to the explicitly joined field", () => {
    filterWidget().click();
    cy.wait("@filterValues");

    cy.findByPlaceholderText("Search the list").type("Awe");

    selectFromDropdown(["Awesome Concrete Shoes", "Awesome Iron Hat"]);

    cy.button("Add filter").click();

    cy.location("search").should(
      "eq",
      "?text=Awesome%20Concrete%20Shoes&text=Awesome%20Iron%20Hat",
    );

    filterWidget().contains("2 selections");

    cy.findByTestId("dashcard").within(() => {
      cy.findAllByText("Awesome Concrete Shoes");
      cy.findAllByText("Awesome Iron Hat");
    });
  });
});

function selectFromDropdown(values) {
  values.forEach(value => {
    cy.findByTestId(`${value}-filter-value`).should("be.visible").click();
  });
}
