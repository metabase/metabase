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

const countQuestionDetails = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

const categoriesQuestionDetails = {
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
    cy.createNativeQuestion(categoriesQuestionDetails);
    cy.createQuestionAndDashboard({
      questionDetails: countQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Dropdown");
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

    cy.findByText("Select…").click();
    popover().within(() => cy.findByText("Category").click());
    saveDashboard();

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
  });

  it("should be able to use a static list source", () => {
    cy.createQuestionAndDashboard({
      questionDetails: countQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Dropdown");
    cy.findByText("Custom list").click();
    modal().within(() => {
      cy.findByPlaceholderText(/banana/).type("Apple\nGoogle");
      cy.button("Done").click();
    });
    cy.findByText("Select…").click();
    popover().within(() => {
      cy.findByText("Source").click();
    });
    saveDashboard();

    cy.findByText("Text").click();
    popover().within(() => {
      cy.findByText("Apple").should("be.visible");
      cy.findByText("Google").should("be.visible");

      cy.findByPlaceholderText("Search the list").type("Goo");
      cy.findByText("Apple").should("not.exist");
      cy.findByText("Google").click();
      cy.button("Add filter").click();
    });
    cy.wait("@getCardQuery");
  });
});
