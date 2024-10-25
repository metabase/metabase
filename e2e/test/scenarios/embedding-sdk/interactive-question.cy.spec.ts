import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  modal,
  popover,
  restore,
  setTokenFeatures,
  tableHeaderClick,
  tableInteractive,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";
import {
  EMBEDDING_SDK_STORY_HOST,
  describeSDK,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  JWT_SHARED_SECRET,
  setupJwt,
} from "e2e/support/helpers/e2e-jwt-helpers";

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

    cy.get("@questionId").then(questionId => {
      visitFullAppEmbeddingUrl({
        url: EMBEDDING_SDK_STORY_HOST,
        qs: {
          id: "embeddingsdk-interactivequestion--default",
          viewMode: "story",
        },
        onBeforeLoad: (window: any) => {
          window.JWT_SHARED_SECRET = JWT_SHARED_SECRET;
          window.METABASE_INSTANCE_URL = Cypress.config().baseUrl;
          window.QUESTION_ID = questionId;
        },
      });
    });

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

  it("can save a question", () => {
    cy.intercept("POST", "/api/card").as("createCard");

    cy.findAllByTestId("cell-data").last().click();

    popover().findByText("See these Orders").click();

    cy.findByRole("button", { name: "Save" }).click();

    modal().within(() => {
      cy.findByRole("radiogroup").findByText("Save as new question").click();

      cy.findByPlaceholderText("What is the name of your question?")
        .clear()
        .type("Foo Bar Orders");

      cy.findByRole("button", { name: "Save" }).click();
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Foo Bar Orders");
    });
  });
});
