import {
  editDashboard,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
  openQuestionActions,
  visitQuestion,
  setFilterQuestionSource,
  setFilterListSource,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const dashboardQuestionDetails = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

const structuredQuestionDetails = {
  name: "GUI source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
  },
};

const nativeQuestionDetails = {
  name: "SQL source",
  native: {
    query: "select distinct CATEGORY from PRODUCTS order by CATEGORY limit 2",
  },
};

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should be able to use a structured question source", () => {
    cy.createQuestion(structuredQuestionDetails, { wrapId: true });
    cy.createQuestionAndDashboard({
      questionDetails: dashboardQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Is");
    mapFilterToQuestion();
    setFilterQuestionSource({ question: "GUI source", field: "Category" });
    saveDashboard();
    filterDashboard();

    cy.get("@questionId").then(visitQuestion);
    archiveQuestion();
  });

  it("should be able to use a native question source", () => {
    cy.createNativeQuestion(nativeQuestionDetails, { wrapId: true });
    cy.createQuestionAndDashboard({
      questionDetails: dashboardQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Is");
    mapFilterToQuestion();
    setFilterQuestionSource({ question: "SQL source", field: "CATEGORY" });
    saveDashboard();
    filterDashboard();

    cy.get("@questionId").then(visitQuestion);
    archiveQuestion();
  });

  it("should be able to use a static list source", () => {
    cy.createQuestionAndDashboard({
      questionDetails: dashboardQuestionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    editDashboard();
    setFilter("Text or Category", "Is");
    mapFilterToQuestion();
    setFilterListSource({ values: ["Doohickey", "Gadget"] });
    saveDashboard();
    filterDashboard();
  });
});

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
    cy.wait("@getCardQuery");
  });
};

const archiveQuestion = () => {
  openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    "This question will be removed from any dashboards or pulses using it. It will also be removed from the filter that uses it to populate values.",
  );
};
