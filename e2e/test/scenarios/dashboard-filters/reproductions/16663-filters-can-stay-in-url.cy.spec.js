import {
  restore,
  editDashboard,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
  },
};

const parameters = [
  {
    name: "Quarter and Year",
    slug: "quarter_and_year",
    id: "f8ae0c97",
    type: "date/quarter-year",
    sectionId: "date",
    default: "Q1-2023",
  },
];

const dashboardDetails = { parameters };

describe("issue 16663", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove filter value from url after going to another dashboard (metabase#16663)", () => {
    const dahsboardToRedirect = "Orders in a dashboard";

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        visitDashboard(dashboard_id);
      },
    );

    editDashboard();

    cy.get("main header").icon("gear").click();

    saveDashboard();

    cy.url().should("include", "quarter_and_year=Q1");

    cy.findByPlaceholderText("Search…").type(dahsboardToRedirect);

    cy.findByTestId("search-results-floating-container")
      .findByText(dahsboardToRedirect)
      .click();

    cy.url().should("include", "orders-in-a-dashboard");
    cy.url().should("not.include", "quarter_and_year=Q1");
  });
});
