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
    limit: 4,
  },
};

const questionDetails = modelId => ({
  name: "Question",
  query: {
    "source-table": `card__${modelId}`,
  },
});

describe("issue 43154", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to see field values on a question column based on a model (metabase#43154)", () => {
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
    popover().findByText("Category").click();
    saveDashboard();
    getDashboardCard().within(() => {
      // Product ID values
      cy.findByText("105").should("be.visible");
      cy.findByText("123").should("be.visible");
    });

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    getDashboardCard().within(() => {
      // Product ID values
      cy.findByText("105").should("be.visible");
      cy.findByText("123").should("not.exist");
    });
  });
});
