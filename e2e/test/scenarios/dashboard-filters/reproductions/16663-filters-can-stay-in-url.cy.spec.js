import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
  },
};

const FILTER = {
  name: "Quarter and Year",
  slug: "quarter_and_year",
  id: "f8ae0c97",
  type: "date/quarter-year",
  sectionId: "date",
  default: "Q1-2023",
};

const dashboardDetails = { parameters: [FILTER] };

describe("issue 16663", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove filter value from url after going to another dashboard (metabase#16663)", () => {
    const dashboardToRedirect = "Orders in a dashboard";
    const queryParam = "quarter_and_year=Q1";

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        addOrUpdateDashboardCard({
          dashboard_id: dashboardCard.dashboard_id,
          card_id: dashboardCard.card_id,
          card: {
            parameter_mappings: [
              {
                parameter_id: FILTER.id,
                card_id: dashboardCard.card_id,
                target: [
                  "dimension",
                  [
                    "field",
                    ORDERS.CREATED_AT,
                    {
                      "base-type": "type/DateTime",
                    },
                  ],
                ],
              },
            ],
          },
        });
        visitDashboard(dashboard_id);
      },
    );

    cy.url().should("include", queryParam);

    cy.findByPlaceholderText("Search…").type(dashboardToRedirect);

    cy.findByTestId("search-results-floating-container")
      .findByText(dashboardToRedirect)
      .click();

    cy.url().should("include", "orders-in-a-dashboard");
    cy.url().should("not.include", queryParam);
  });
});
