import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ENTITY_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  it("can find the embed.v1.js file", () => {
    cy.request("http://localhost:4000/app/embed.v1.js").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.a("string").and.not.be.empty;
    });
  });

  it("displays a dashboard", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      H.assertTableRowsCount(2000);
    });
  });

  it("displays a question", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ID,
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("displays a dashboard using entity id", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ENTITY_ID,
    });

    cy.wait("@getDashCardQuery");

    frame.within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      H.assertTableRowsCount(2000);
    });
  });

  it("displays a question using entity id", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ENTITY_ID,
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("displays the exploration template", () => {
    const frame = H.loadSdkIframeEmbedTestPage({ template: "exploration" });

    frame.within(() => {
      H.assertSdkNotebookEditorUsable();

      // We hide the "Save" button for now. This will definitely be changed in the future.
      cy.findByRole("button", { name: "Save" }).should("not.exist");
    });
  });

  it("applies the provided locale", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      locale: "de",
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    frame.within(() => {
      cy.findByText("2000 Zeilen").should("exist");
    });
  });

  it("destroys the iframe when embed.destroy is called", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ID,
    });

    cy.wait("@getCardQuery");
    cy.get("iframe").should("be.visible");

    cy.log("1. we call embed.destroy to remove the iframe");
    frame.window().then((win) => {
      // @ts-expect-error -- this is within the iframe
      win.embed.destroy();
    });

    cy.log("2. iframe should be removed");
    cy.get("iframe").should("not.exist");
  });

  it("updates the question id with embed.updateSettings", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      questionId: ORDERS_QUESTION_ID,
    });

    cy.wait("@getCardQuery");
    frame.findByText("Orders, Count").should("not.exist");

    cy.log("1. call embed.updateSettings to update the question id");
    frame.window().then((win) => {
      // @ts-expect-error -- this is within the iframe
      win.embed.updateSettings({ questionId: ORDERS_COUNT_QUESTION_ID });
    });

    cy.wait("@getCardQuery");

    cy.get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .should("exist")
      .within(() => {
        cy.log("2. the question should be updated");
        cy.findByText("Orders, Count").should("be.visible");

        H.tableInteractive().within(() => {
          cy.findByText("Count").should("be.visible");
          cy.findByText("18,760").should("be.visible");
        });
      });
  });
});
