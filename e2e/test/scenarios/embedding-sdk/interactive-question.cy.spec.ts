import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  popover,
  restore,
  setTokenFeatures,
  tableHeaderClick,
  tableInteractive,
} from "e2e/support/helpers";
import { describeSDK } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { setupJwt } from "e2e/support/helpers/e2e-jwt-helpers";
import {
  saveInteractiveQuestionAsNewQuestion,
  visitInteractiveQuestionStory,
} from "e2e/test/scenarios/embedding-sdk/helpers/save-interactive-question-e2e-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeSDK("scenarios > embedding-sdk > interactive-question", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupJwt();
    cy.request("PUT", "/api/setting", {
      "enable-embedding-sdk": true,
    });

    createQuestion(
      {
        name: "47563",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          limit: 2,
        },
      },
      { wrapId: true },
    );

    cy.signOut();

    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("GET", "/api/user/current").as("getUser");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    visitInteractiveQuestionStory();

    cy.wait("@getUser").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });
  });

  it("should show question content", () => {
    cy.get("#metabase-sdk-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("Product ID").should("be.visible");
        cy.findByText("Max of Quantity").should("be.visible");
      });
  });

  it("should not fail on aggregated question drill", () => {
    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    cy.findAllByTestId("cell-data").last().click();

    cy.on("uncaught:exception", error => {
      expect(
        error.message.includes(
          "Error converting :aggregation reference: no aggregation at index 0",
        ),
      ).to.be.false;
    });

    popover().findByText("See these Orders").click();

    cy.icon("warning").should("not.exist");
  });

  it("should be able to hide columns from a table", () => {
    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    tableInteractive().findByText("Max of Quantity").should("be.visible");

    tableHeaderClick("Max of Quantity");

    popover()
      .findByTestId("click-actions-sort-control-formatting-hide")
      .click();

    tableInteractive().findByText("Max of Quantity").should("not.exist");
  });

  it("can save a question to a default collection", () => {
    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 1",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 1");
      expect(response?.body.collection_id).to.equal(null);
    });
  });

  it("can save a question to a selected collection", () => {
    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 2",
      collectionPickerPath: ["Our analytics", "First collection"],
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 2");
      expect(response?.body.collection_id).to.equal(FIRST_COLLECTION_ID);
    });
  });

  it("can save a question to a pre-defined collection", () => {
    visitInteractiveQuestionStory({
      saveToCollectionId: Number(THIRD_COLLECTION_ID),
    });

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 3",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 3");
      expect(response?.body.collection_id).to.equal(THIRD_COLLECTION_ID);
    });
  });
});
