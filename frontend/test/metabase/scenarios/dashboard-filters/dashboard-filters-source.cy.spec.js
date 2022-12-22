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

const sampleQuestionDetails = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

const nativeQuestionDetails = {
  name: "Product categories",
  native: {
    query: "select distinct CATEGORY from PRODUCTS order by CATEGORY limit 2",
  },
};

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should be able to use a native card source", () => {
    cy.createNativeQuestion(nativeQuestionDetails);
    cy.createQuestionAndDashboard({
      questionDetails: sampleQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Dropdown");
    setupNativeCard();
    mapFilterToCard();
    saveDashboard();
    filterDashboard();
  });

  it("should be able to use a static list source", () => {
    cy.createQuestionAndDashboard({
      questionDetails: sampleQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Dropdown");
    setupCustomList();
    mapFilterToCard();
    saveDashboard();
    filterDashboard();
  });
});

const setupNativeCard = () => {
  cy.findByText("Values from a model or question").click();
  modal().within(() => {
    cy.findByText("Saved Questions").click();
    cy.findByText("Product categories").click();
    cy.button("Select column").click();
  });
  modal().within(() => {
    cy.findByText("Pick a column").click();
  });
  popover().within(() => {
    cy.findByText("CATEGORY").click();
  });
  modal().within(() => {
    cy.button("Done").click();
  });
};

const setupCustomList = () => {
  cy.findByText("Custom list").click();
  modal().within(() => {
    cy.findByPlaceholderText(/banana/).type("Doohickey\nGadget");
    cy.button("Done").click();
  });
};

const mapFilterToCard = () => {
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
