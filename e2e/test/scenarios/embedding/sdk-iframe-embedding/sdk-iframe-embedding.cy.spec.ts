import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ENTITY_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > modular embedding", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ signOut: true });
  });

  it("can find the embed.js file", () => {
    const baseUrl = Cypress.config("baseUrl");
    cy.request(`${baseUrl}/app/embed.js`).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.a("string").and.not.be.empty;
    });
  });

  it("uses the embedding-simple client request header", () => {
    H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
    });

    cy.wait("@getDashCardQuery").then(({ request }) => {
      expect(request?.headers?.["x-metabase-client"]).to.equal(
        "embedding-simple",
      );
    });
  });

  it("displays a dashboard", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
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
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
          },
        },
      ],
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("displays a dashboard using entity id", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ENTITY_ID,
          },
        },
      ],
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
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ENTITY_ID,
          },
        },
      ],
    });

    cy.wait("@getCardQuery");

    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("displays the exploration template", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: "new",
          },
        },
      ],
    });

    frame.within(() => {
      H.assertSdkNotebookEditorUsable(frame);

      // We hide the "Save" button for now. This will be customizable in the future.
      cy.findByRole("button", { name: "Save" }).should("not.exist");
    });
  });

  it("applies the provided locale", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        locale: "de",
      },
    });

    frame.within(() => {
      cy.findByText("Zeige die ersten 2,000 Zeilen").should("exist");
    });
  });

  it("updates the question id with embed.setAttribute", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
          },
        },
      ],
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
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: ORDERS_QUESTION_ID,
          },
        },
      ],
      onVisitPage: (win) => {
        const element = win.document.querySelector("metabase-question")!;
        element.addEventListener("ready", () => {
          win.document.body.setAttribute(
            "data-consumer-event-triggered",
            "true",
          );
        });

        // assert that the attribute is not set at the start
        const attrValue = win.document.body.getAttribute(
          "data-consumer-event-triggered",
        );
        expect(attrValue).to.not.equal("true");
      },
    });

    cy.wait("@getCardQuery");

    cy.log("ready event should be fired after the iframe is loaded");
    cy.get("iframe").should("be.visible");
    cy.get("body").should("have.attr", "data-consumer-event-triggered", "true");

    cy.log("iframe content should now be loaded");
    frame.within(() => {
      H.assertSdkInteractiveQuestionOrdersUsable();
    });
  });

  it("shows dashboard title when updateSettings({ withTitle: true }) is called", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            withTitle: false,
          },
        },
      ],
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

  describe("auto-refreshing dashboard", () => {
    /**
     * Unfortunately, cy.clock() doesn't seem to work with mocking the timing inside the iframe,
     * so we have to use real timeouts here.
     */
    it('does not automatically refresh the dashboard when "auto-refresh-interval" is not set', () => {
      const frame = H.loadSdkIframeEmbedTestPage({
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
            },
          },
        ],
      });

      frame.within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");
        cy.findByText("Orders").should("be.visible");
        H.assertTableRowsCount(2000);
      });

      cy.get("@getDashCardQuery.all").then((requests) => {
        cy.wrap(requests.length).as("initialRequestCount");
      });

      cy.log("wait for the retrigger");
      cy.wait(1000);
      cy.get("@initialRequestCount").then((initialRequestCount) => {
        cy.get("@getDashCardQuery.all").should(
          "have.length",
          initialRequestCount,
        );
      });
    });

    it('automatically refresh the dashboard when "auto-refresh-interval" is set', () => {
      const frame = H.loadSdkIframeEmbedTestPage({
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              autoRefreshInterval: 1,
            },
          },
        ],
      });

      frame.within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");
        cy.findByText("Orders").should("be.visible");
        H.assertTableRowsCount(2000);
      });

      cy.get("@getDashCardQuery.all").then((requests) => {
        cy.wrap(requests.length).as("initialRequestCount");
      });

      cy.log("wait for the retrigger");
      cy.get("@initialRequestCount").then((initialRequestCount) => {
        cy.get("@getDashCardQuery.all").should(
          "have.length.above",
          initialRequestCount,
        );
      });
    });
  });

  it("CSP nonces are set for custom expression styles (EMB-707)", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: "new",
          },
        },
      ],
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

  describe("analytics", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.prepareSdkIframeEmbedTest({
        enabledAuthMethods: ["jwt"],
        signOut: false,
      });
      H.enableTracking();
    });

    it("should send an modular embedding usage event", () => {
      cy.signOut();
      cy.visit("/");
      const frame = H.loadSdkIframeEmbedTestPage({
        origin: "http://different-than-metabase-instance.com",
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              "with-subscriptions": true,
            },
          },
          {
            component: "metabase-question",
            attributes: {
              questionId: ORDERS_QUESTION_ID,
            },
          },
          {
            component: "metabase-question",
            attributes: {
              questionId: "new",
            },
          },
          {
            component: "metabase-browser",
            attributes: {},
          },
        ],
        selector: `[dashboard-id="${ORDERS_DASHBOARD_ID}"] > iframe`, // get only the first iframe
      });

      frame.within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");
        cy.findByText("Orders").should("be.visible");
        H.assertTableRowsCount(2000);
      });

      H.expectUnstructuredSnowplowEvent({
        event: "setup",
        global: {
          auth_method: "sso",
        },
        dashboard: {
          with_title: {
            false: 0,
            true: 1,
          },
          with_downloads: {
            false: 1,
            true: 0,
          },
          drills: {
            false: 0,
            true: 1,
          },
          with_subscriptions: {
            false: 0,
            true: 1,
          },
        },
        question: {
          drills: {
            false: 0,
            true: 1,
          },
          with_downloads: {
            false: 1,
            true: 0,
          },
          with_title: {
            false: 0,
            true: 1,
          },
          is_save_enabled: {
            false: 1,
            true: 0,
          },
          with_alerts: {
            false: 1,
            true: 0,
          },
        },
        exploration: {
          is_save_enabled: {
            false: 1,
            true: 0,
          },
        },
        browser: {
          read_only: {
            false: 0,
            true: 1,
          },
        },
      });
    });

    it("should not send an modular embedding usage event in the preview", () => {
      cy.visit(`/question/${ORDERS_QUESTION_ID}`);

      H.openEmbedJsModal();
      H.embedModalEnableEmbedding();

      H.waitForSimpleEmbedIframesToLoad();
      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByText("Orders").should("be.visible");
      });

      H.expectUnstructuredSnowplowEvent(
        {
          event: "setup",
          global: {
            auth_method: "session",
          },
        },
        // Expect that the usage event shouldn't be sent
        0,
      );
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
