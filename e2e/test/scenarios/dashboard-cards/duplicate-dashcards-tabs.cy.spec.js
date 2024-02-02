import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  dashboardCards,
  duplicateTab,
  filterWidget,
  findDashCardAction,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

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

function createMappedDashcard(mappedQuestionId) {
  return createMockDashboardCard({
    id: 1,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: PARAMETER.CATEGORY.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 0,
    col: 0,
    size_x: 10,
    size_y: 5,
  });
}

describe("scenarios > dashboard cards > duplicate", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.createQuestion(MAPPED_QUESTION_CREATE_INFO).then(
      ({ body: { id: mappedQuestionId } }) => {
        cy.createDashboard(DASHBOARD_CREATE_INFO).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [createMappedDashcard(mappedQuestionId)],
            }).then(() => {
              cy.wrap(dashboardId).as("dashboardId");
            });
          },
        );
      },
    );
  });

  it("should allow the user to duplicate a dashcard", () => {
    // 1. Confirm duplication works
    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
      cy.findByLabelText("Edit dashboard").click();
    });

    findDashCardAction(getDashboardCard(0), "Duplicate").click();
    saveDashboard();

    cy.findAllByText("Products").should("have.length", 2);

    // 2. Confirm filter still works
    filterWidget().click();
    popover().within(() => {
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    cy.findAllByText("Incredible Bronze Pants").should("have.length", 2);
  });

  it("should allow the user to duplicate a tab", () => {
    // 1. Confirm duplication works
    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
      cy.findByLabelText("Edit dashboard").click();
    });

    duplicateTab("Tab 1");
    saveDashboard();

    dashboardCards().within(() => {
      cy.findByText("Products");
    });

    // 2. Confirm filter still works
    filterWidget().click();
    popover().within(() => {
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    dashboardCards().within(() => {
      cy.findByText("Incredible Bronze Pants");
    });
  });
});
