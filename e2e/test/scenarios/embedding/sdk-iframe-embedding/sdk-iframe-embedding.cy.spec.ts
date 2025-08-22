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
    H.prepareSdkIframeEmbedTest({ signOut: true });
  });

  it("can find the embed.js file", () => {
    cy.request("http://localhost:4000/app/embed.js").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.a("string").and.not.be.empty;
    });
  });

  it("uses the embedding-simple client request header", () => {
    H.loadSdkIframeEmbedTestPage({
      element: "metabase-dashboard",
      attributes: {
        dashboardId: ORDERS_DASHBOARD_ID,
      },
    });

    cy.wait("@getDashCardQuery").then(({ request }) => {
      expect(request?.headers?.["x-metabase-client"]).to.equal(
        "embedding-simple",
      );
    });
  });

  it("displays a dashboard", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-dashboard",
      attributes: {
        dashboardId: ORDERS_DASHBOARD_ID,
      },
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
      element: "metabase-question",
      attributes: {
        questionId: ORDERS_QUESTION_ID,
      },
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("displays a dashboard using entity id", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-dashboard",
      attributes: {
        dashboardId: ORDERS_DASHBOARD_ENTITY_ID,
      },
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
      element: "metabase-question",
      attributes: {
        questionId: ORDERS_QUESTION_ENTITY_ID,
      },
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("displays the exploration template", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-question",
      attributes: {
        questionId: "new",
      },
    });

    frame.within(() => {
      H.assertSdkNotebookEditorUsable(frame);

      // We hide the "Save" button for now. This will be customizable in the future.
      cy.findByRole("button", { name: "Save" }).should("not.exist");
    });
  });

  it("applies the provided locale", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-dashboard",
      attributes: {
        dashboardId: ORDERS_DASHBOARD_ID,
      },
      metabaseConfig: {
        locale: "de",
      },
    });

    frame.within(() => {
      cy.findByText("2,000 Zeilen").should("exist");
    });
  });

  it("updates the question id with embed.setAttribute", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-question",
      attributes: {
        questionId: ORDERS_QUESTION_ID,
      },
    });

    cy.wait("@getCardQuery");
    frame.findByText("Orders, Count").should("not.exist");

    cy.log("1. call embed.setAttribute to update the question id");
    frame.window().then((win) => {
      win
        .document!.querySelector("metabase-question")!
        .setAttribute("question-id", ORDERS_COUNT_QUESTION_ID.toString());
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

  it("fires ready event after iframe is loaded", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-question",
      attributes: {
        questionId: ORDERS_QUESTION_ID,
      },
      onVisitPage: () => {
        cy.window().then((win) => {
          const element = win.document!.querySelector("metabase-question")!;
          element.addEventListener("ready", () => {
            win.document!.body.setAttribute(
              "data-consumer-event-triggered",
              "true",
            );
          });
        });
      },
    });

    cy.log("ready event should not be fired before the page loads");
    cy.get("body").should(
      "not.have.attr",
      "data-consumer-event-triggered",
      "true",
    );

    cy.wait("@getCardQuery");

    cy.log("ready event should be fired after the page loads");
    cy.get("iframe").should("be.visible");
    cy.get("body").should("have.attr", "data-consumer-event-triggered", "true");

    cy.log("iframe content should now be loaded");
    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("shows dashboard title when updateSettings({ withTitle: true }) is called", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-dashboard",
      attributes: {
        dashboardId: ORDERS_DASHBOARD_ID,
        withTitle: false,
      },
    });

    cy.wait("@getDashCardQuery");

    cy.log("1. dashboard title should initially be hidden");
    frame.within(() => {
      cy.findByText("Orders in a dashboard").should("not.exist");
      cy.findByText("Orders").should("be.visible");
    });

    cy.log("2. call setAttribute to show the title");
    frame.window().then((win) => {
      const element = win.document!.querySelector("metabase-dashboard")!;
      element.setAttribute("with-title", "true");
    });

    cy.log("3. dashboard title should now be visible");
    getIframeWindow().findByText("Orders in a dashboard").should("be.visible");
  });

  it("CSP nonces are set for custom expression styles (EMB-707)", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      element: "metabase-question",
      attributes: {
        questionId: "new",
      },
    });

    frame.within(() => {
      cy.findByText("Orders").should("be.visible");

      H.popover().within(() => {
        cy.findByText("Orders").click();
      });

      cy.log("csp nonces should be set");
      cy.get("style[nonce]")
        .should("have.length.greaterThan", 0)
        .first()
        .should("have.attr", "nonce")
        .and("have.length.greaterThan", 4);

      cy.findByRole("button", { name: "Custom column" }).click();

      cy.log("injected codemirror styles should be set");
      cy.findByTestId("custom-expression-query-editor")
        .should("be.visible")
        .find(".cm-editor .cm-placeholder")
        .and("have.css", "color", "rgb(136, 136, 136)");

      cy.findByRole("button", { name: "Cancel" }).click();
    });
  });
});

const getIframeWindow = () =>
  cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty");
