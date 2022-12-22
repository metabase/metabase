import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { REVIEWS_ID } = SAMPLE_DATABASE;
describe("issue 27356: 'Something's gone wrong' error when moving between dashboards that has/hasn't filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not error when navigating from a dashboard with filters to a dashboard without filters", async () => {
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

    const {
      body: { dashboard_id: dashboardWithFilter },
    } = await cy.createQuestionAndDashboard(questionDetails, ratingFilter);

    // const {
    //   body: { dashboard_id: dashboardWithoutFilter },
    // } = await cy.createQuestionAndDashboard(questionDetails);

    cy.visit(`/dashboard/${dashboardWithFilter}`);
  });
});
