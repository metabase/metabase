import {
  editDashboard,
  modal,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const dashboardQuestionDetails = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should be able to use a static list source", () => {
    cy.createQuestionAndDashboard({
      questionDetails: dashboardQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Dropdown");
    setupCustomList();
    mapFilterToQuestion();
    saveDashboard();
    filterDashboard();
  });
});

const setupCustomList = () => {
  cy.findByText("Dropdown list").click();
  cy.findByText("Edit").click();

  modal().within(() => {
    cy.findByText("Custom list").click();
    cy.findByRole("textbox").clear().type("Doohickey\nGadget");
    cy.button("Done").click();
  });
};

const mapFilterToQuestion = () => {
  cy.findByText("Select…").click();
  popover().within(() => cy.findByText("Category").click());
};

const filterDashboard = () => {
  cy.findByText("Text").click();
  popover().within(() => {
    cy.findByText("Doohickey").should("be.visible");
    cy.findByText("Gadget").should("be.visible");
    cy.findByText("Gizmo").should("not.exist");

    cy.findByPlaceholderText("Search the list").type("Gadget");
    cy.findByText("Doohickey").should("not.exist");
    cy.findByText("Gadget").click();
    cy.button("Add filter").click();
  });
  cy.wait("@getCardQuery");
};
