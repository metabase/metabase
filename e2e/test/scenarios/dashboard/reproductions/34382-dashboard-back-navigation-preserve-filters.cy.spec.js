import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  dashboardParametersContainer,
  getDashboardCard,
  restore,
  visitDashboard,
  filterWidget,
  queryBuilderHeader,
  popover,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 34382", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it(
    "should preserve filter value when navigating between the dashboard and the query builder with auto-apply disabled (metabase#34382)",
    { tags: "@flaky" },
    () => {
      createDashboardWithCards();
      visitDashboard("@dashboardId");

      addFilterValue("Gizmo");
      applyFilter();

      cy.log("Navigate to Products question");
      getDashboardCard().findByText("Products").click();

      cy.log("Navigate back to dashboard");
      queryBuilderHeader()
        .findByLabelText("Back to Products in a dashboard")
        .click();

      cy.location("search").should("eq", "?category=Gizmo");
      filterWidget().contains("Gizmo");

      getDashboardCard().within(() => {
        // only products with category "Gizmo" are filtered
        cy.findAllByTestId("table-row")
          .find("td")
          .eq(3)
          .should("contain", "Gizmo");
      });
    },
  );
});

const createDashboardWithCards = () => {
  const getParameterMapping = ({ card_id }, parameters) => ({
    parameter_mappings: parameters.map(parameter => ({
      card_id,
      parameter_id: parameter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    })),
  });

  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID },
  };

  const questionDashcardDetails = {
    row: 0,
    col: 0,
    size_x: 8,
    size_y: 8,
    visualization_settings: {},
  };
  const filterDetails = {
    name: "Product Category",
    slug: "category",
    id: "96917421",
    type: "category",
  };

  const dashboardDetails = {
    name: "Products in a dashboard",
    auto_apply_filters: false,
    parameters: [filterDetails],
  };

  cy.createDashboard(dashboardDetails).then(
    ({ body: { id: dashboard_id } }) => {
      cy.createQuestion(questionDetails).then(
        ({ body: { id: question_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id: -1,
                card_id: question_id,
                ...questionDashcardDetails,
                ...getParameterMapping({ card_id: question_id }, [
                  filterDetails,
                ]),
              },
            ],
          });
        },
      );

      cy.wrap(dashboard_id).as("dashboardId");
    },
  );
};

function addFilterValue(value) {
  filterWidget().click();
  popover().within(() => {
    cy.findByText(value).click();
    cy.findByRole("button", { name: "Add filter" }).click();
  });
}

function applyFilter() {
  dashboardParametersContainer()
    .findByRole("button", { name: "Apply" })
    .click();

  cy.wait("@dashcardQuery");
}
