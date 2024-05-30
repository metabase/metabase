import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

const modelDetails = {
  name: "Model",
  type: "model",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        alias: "People - User",
        condition: [
          "=",
          ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
          [
            "field",
            PEOPLE.ID,
            { "base-type": "type/BigInteger", "join-alias": "People - User" },
          ],
        ],
        "source-table": PEOPLE_ID,
      },
    ],
  },
};

const questionDetails = modelId => ({
  name: "Question",
  type: "question",
  query: {
    "source-table": `card__${modelId}`,
  },
});

const questionWithAggregationDetails = modelId => ({
  name: "Question",
  type: "question",
  query: {
    "source-table": `card__${modelId}`,
    aggregation: [["count"]],
  },
});

describe("issue 43154", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to see field values with a model-based question (metabase#43154)", () => {
    verifyNestedFilter(questionDetails);
  });

  it.skip("should be able to see field values with a model-based question with aggregation (metabase#43154)", () => {
    verifyNestedFilter(questionWithAggregationDetails);
  });
});

function verifyNestedFilter(questionDetails) {
  createQuestion(modelDetails).then(({ body: model }) => {
    cy.createDashboardWithQuestions({
      questions: [questionDetails(model.id)],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);
    });
  });

  editDashboard();
  setFilter("Text or Category", "Is");
  getDashboardCard().findByText("Select…").click();
  popover().findByText("People - User → Source").click();
  saveDashboard();

  filterWidget().click();
  popover().within(() => {
    cy.findByText("Twitter").click();
    cy.button("Add filter").click();
  });
}
