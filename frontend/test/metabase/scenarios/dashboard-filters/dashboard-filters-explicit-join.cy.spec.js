import {
  restore,
  filterWidget,
  popover,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { card_id, dashboard_id } = dashboardCard;

        const updatedCardDetails = {
          size_x: 16,
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

    cy.findByPlaceholderText("Search the list").type("Awe");

    selectFromDropdown(["Awesome Concrete Shoes", "Awesome Iron Hat"]);

    cy.button("Add filter").click();

    cy.location("search").should(
      "eq",
      "?text=Awesome%20Concrete%20Shoes&text=Awesome%20Iron%20Hat",
    );

    filterWidget().contains("2 selections");

    cy.get(".Card").within(() => {
      cy.findAllByText("Awesome Concrete Shoes");
      cy.findAllByText("Awesome Iron Hat");
    });
  });
});

function selectFromDropdown(values) {
  popover().within(() => {
    values.forEach(value => {
      cy.findByText(value).click();
    });
  });
}
