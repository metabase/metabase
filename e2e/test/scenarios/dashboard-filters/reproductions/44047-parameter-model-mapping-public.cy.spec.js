import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  filterWidget,
  popover,
  restore,
  updateDashboardCards,
  visitDashboard,
  visitPublicDashboard,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Question",
  type: "question",
  query: {
    "source-table": ORDERS_ID,
    limit: 100,
  },
};

const modelDetails = {
  name: "Model",
  type: "model",
  query: {
    "source-table": ORDERS_ID,
    limit: 100,
  },
};

const sourceQuestionDetails = {
  name: "Source question",
  type: "question",
  query: {
    "source-table": ORDERS_ID,
    fields: [
      ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
      ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
    ],
  },
};

const parameterDetails = {
  name: "Text",
  slug: "text",
  id: "5a425670",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [parameterDetails],
};

function getQuestionDashcardDetails(dashboard, card) {
  return {
    dashboard_id: dashboard.id,
    card_id: card.id,
    parameter_mappings: [
      {
        card_id: card.id,
        parameter_id: parameterDetails.id,
        target: [
          "dimension",
          ["field", ORDERS.QUANTITY, { type: "type/Integer" }],
        ],
      },
    ],
  };
}

function getModelDashcardDetails(dashboard, card) {
  return {
    dashboard_id: dashboard.id,
    card_id: card.id,
    parameter_mappings: [
      {
        card_id: card.id,
        parameter_id: parameterDetails.id,
        target: ["dimension", ["field", "QUANTITY", { type: "type/Integer" }]],
      },
    ],
  };
}

describe("44047", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      semantic_type: "type/Category",
    });
    cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
      type: "internal",
      name: "Rating",
    });
    cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
      values: [[0, "Remapped"]],
    });
  });

  it("should be able to use remapped values from an integer field with an overridden semantic type used for a custom dropdown source in public dashboards (metabase#44047)", () => {
    createQuestion(sourceQuestionDetails);
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails, modelDetails],
    }).then(({ dashboard, questions: cards }) => {
      updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          getQuestionDashcardDetails(dashboard, cards[0]),
          getModelDashcardDetails(dashboard, cards[1]),
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.log("verify filtering works in a regular dashboard");
    visitDashboard("@dashboardId");
    verifyFilterWithRemapping();

    cy.log("verify filtering works in a public dashboard");
    cy.get("@dashboardId").then(visitPublicDashboard);
    verifyFilterWithRemapping();
  });
});

function verifyFilterWithRemapping() {
  filterWidget().click();
  popover().within(() => {
    cy.findByPlaceholderText("Search the list").type("Remapped");
    cy.findByText("Remapped").click();
    cy.button("Add filter").click();
  });
}
