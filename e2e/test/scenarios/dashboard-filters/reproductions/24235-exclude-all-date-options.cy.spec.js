import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  popover,
  restore,
  visitDashboard,
  filterWidget,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: { "source-table": PRODUCTS_ID, limit: 5 },
};

const parameter = {
  id: "727b06c1",
  name: "Date Filter",
  sectionId: "date",
  slug: "date_filter",
  type: "date/all-options",
};

const parameterTarget = [
  "dimension",
  ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
];

const dashboardDetails = { parameters: [parameter] };

describe("issue 24235", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should remove filter when all exclude options are selected (metabase#24235)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        mapParameterToDashboardCard({ id, card_id, dashboard_id });
        visitDashboard(dashboard_id);
      },
    );

    filterWidget().contains(parameter.name).click();
    popover().within(() => {
      cy.findByText("Exclude...").click();
      cy.findByText("Days of the week...").click();
      cy.findByText("Select none...").click();
      cy.findByText("Add filter").click();
    });

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Select all...").click();
      cy.findByText("Update filter").click();
    });

    cy.wait("@getCardQuery");
    cy.get("[data-testid=cellData]").should(
      "contain",
      "Price, Schultz and Daniel",
    );
  });
});

const mapParameterToDashboardCard = ({ id, card_id, dashboard_id }) => {
  cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 10,
        parameter_mappings: [
          {
            card_id,
            parameter_id: parameter.id,
            target: parameterTarget,
          },
        ],
      },
    ],
  });
};
