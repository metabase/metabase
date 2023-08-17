import {
  restore,
  popover,
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
  },
];

const dashboardDetails = { parameters };

describe("issue 16663", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove filter value from url after going to another dashboard (metabase#16663)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        visitDashboard(dashboard_id);
      },
    );

    editDashboard();

    cy.get("main header").find(".Icon-gear").click();

    cy.findByLabelText("subscriptions sidebar")
      .findByText("No default")
      .click();

    popover().contains("Q1").click();

    saveDashboard();

    cy.url().should("include", "quarter_and_year=Q1");

    visitDashboard(1);

    cy.url().should("not.include", "quarter_and_year=Q1");
  });
});
