import {
  restore,
  openNavigationSidebar,
  navigationSidebar,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { REVIEWS_ID } = SAMPLE_DATABASE;
describe("issue 27356: 'Something's gone wrong' error when moving between dashboards that has/hasn't filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not error when navigating from a dashboard with filters to a dashboard without filters", () => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    const questionDetails = {
      name: "27356",
      query: { "source-table": REVIEWS_ID },
    };

    const ratingFilter = {
      name: "Rating Filter",
      slug: "rating",
      id: "5dfco74e",
      type: "string/=",
      sectionId: "string",
    };

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        parameters: [ratingFilter],
        name: "Test With Params",
      },
    }).then(({ body: { dashboard_id: dashboardWithFilter } }) => {
      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails: { name: "Test Without Params" },
      }).then(async ({ body: { dashboard_id: dashboardWithOutFilter } }) => {
        await cy.request(
          "POST",
          `/api/bookmark/dashboard/${dashboardWithFilter}`,
        );
        await cy.request(
          "POST",
          `/api/bookmark/dashboard/${dashboardWithOutFilter}`,
        );

        //Visit dashboard with filter
        cy.visit(`/dashboard/${dashboardWithFilter}`);
        cy.wait("@getDashboard");
        cy.findByText("27356");

        //Navigate to Dashboard without filter
        openNavigationSidebar();
        navigationSidebar().within(() => {
          cy.findByText("Test Without Params").click();
        });

        cy.wait("@getDashboard");
        cy.findByText("27356");

        //Navigate back to dashboard with filter
        navigationSidebar().within(() => {
          cy.findByText("Test With Params").click();
        });

        cy.contains("Something's gone wrong").should("not.exist");
      });
    });
  });
});
