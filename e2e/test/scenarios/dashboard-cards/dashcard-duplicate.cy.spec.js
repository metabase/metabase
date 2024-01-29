import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  findDashCardAction,
  getDashboardCard,
  getDashboardCards,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";
import { createMockParameter } from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const PARAMETER = {
  CATEGORY: createMockParameter({
    id: "2",
    name: "Category",
    type: "string/=",
  }),
};

const DASHBOARD_CREATE_INFO = {
  parameters: Object.values(PARAMETER),
};

const MAPPED_QUESTION_CREATE_INFO = {
  name: "Products",
  query: { "source-table": PRODUCTS_ID },
};

describe("scenarios > dashboard cards > duplicate", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.createQuestion(MAPPED_QUESTION_CREATE_INFO).then(
      ({ body: { id: mappedQuestionId } }) => {
        cy.createDashboard(DASHBOARD_CREATE_INFO).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: getDashboardCards(mappedQuestionId),
            }).then(() => {
              cy.wrap(dashboardId).as("dashboardId");
            });
          },
        );
      },
    );
  });

  it("should allow the user to duplicate a dashcard", () => {
    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
      cy.findByLabelText("Edit dashboard").click();
    });

    findDashCardAction(getDashboardCard(0), "Duplicate").click();
    cy.findAllByText("Orders").should("have.length", 2);

    saveDashboard();

    cy.findAllByText("Orders").should("have.length", 2);

    // TODO confirm parameter mapping is preserve
  });
});
