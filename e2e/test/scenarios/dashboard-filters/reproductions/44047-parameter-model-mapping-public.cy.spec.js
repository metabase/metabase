import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  setFilterQuestionSource,
  undoToast,
  visitDashboard,
  visitPublicDashboard,
} from "e2e/support/helpers";
const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Question",
  type: "question",
  query: {
    "source-table": REVIEWS_ID,
    limit: 100,
  },
};

const sourceQuestionDetails = {
  name: "Source question",
  type: "question",
  query: {
    "source-table": REVIEWS_ID,
    fields: [
      ["field", REVIEWS.ID, { "base-type": "type/BigInteger" }],
      ["field", REVIEWS.RATING, { "base-type": "type/BigInteger" }],
    ],
  },
};

const modelDetails = {
  name: "Model",
  type: "model",
  query: {
    "source-table": REVIEWS_ID,
    limit: 100,
  },
};

describe("44047", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/Category",
    });
    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });
    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "A"],
        [2, "B"],
        [3, "C"],
        [4, "D"],
        [5, "E"],
      ],
    });
  });

  it("should be able to use remapped values from an integer field with an overridden semantic type used for a custom dropdown source in public dashboards (metabase#44047)", () => {
    createQuestion(sourceQuestionDetails);
    cy.createDashboardWithQuestions({
      questions: [questionDetails, modelDetails],
    }).then(({ dashboard }) => cy.wrap(dashboard.id).as("dashboardId"));

    cy.log("setup dashboard");
    visitDashboard("@dashboardId");
    editDashboard();
    setFilter("Text or Category", "Is");
    selectDashboardFilter(getDashboardCard(0), "Rating");
    undoToast().button("Undo auto-connection").click();
    selectDashboardFilter(getDashboardCard(1), "Rating");
    setFilterQuestionSource({
      question: sourceQuestionDetails.name,
      field: "Rating",
    });
    saveDashboard();

    cy.log("verify filtering works in a regular dashboard");
    verifyFilterWithRemapping();

    cy.log("verify filtering works in a public dashboard");
    cy.get("@dashboardId").then(visitPublicDashboard);
    verifyFilterWithRemapping();
  });
});

function verifyFilterWithRemapping() {
  filterWidget().click();
  popover().within(() => {
    cy.findByText("A").click();
    cy.button("Add filter").click();
  });

  const sampleReviewer = "dorcas";
  getDashboardCard(0).findByText(sampleReviewer).should("be.visible");
  getDashboardCard(1).findByText(sampleReviewer).should("be.visible");
}
