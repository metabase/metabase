const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_QUESTION = {
  name: "Orders question",
  query: {
    "source-table": ORDERS_ID,
  },
};

describe("scenarios > dashboard > tabs", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "should allow moving different types of dashcards to other tabs",
    // cy auto scroll makes the dashcard actions menu go under the header
    { scrollBehavior: false },
    () => {
      const cards = [
        H.getTextCardDetails({
          text: "Text card",
          // small card aligned to the left so that move icon is out of the viewport
          // unless the left alignment logic kicks in
          size_x: 1,
        }),
        H.getHeadingCardDetails({
          text: "Heading card",
        }),
        H.getLinkCardDetails({
          url: "https://metabase.com",
        }),
      ];

      H.createDashboard().then(({ body: { id: dashboard_id } }) => {
        H.updateDashboardCards({ dashboard_id, cards });

        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.createNewTab();
      H.goToTab("Tab 1");

      cy.log("moving dashcards to second tab");

      cards.forEach(() => {
        H.moveDashCardToTab({ tabName: "Tab 2" });
      });

      H.getDashboardCards().should("have.length", 0);

      H.goToTab("Tab 2");

      H.getDashboardCards().should("have.length", cards.length);

      cy.findAllByTestId("toast-undo").should("have.length", cards.length);

      cy.log("'Undo' toasts should be dismissed when saving the dashboard");

      H.saveDashboard();

      cy.findAllByTestId("toast-undo").should("have.length", 0);
    },
  );

  it("should allow moving dashcard even if we don't have permission on that underlying query", () => {
    const questionDetails = {
      native: {
        query: "select 42",
      },
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    };
    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        collection_id: NORMAL_PERSONAL_COLLECTION_ID,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.signInAsNormalUser();
      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    H.createNewTab();

    H.goToTab("Tab 1");

    H.getDashboardCard()
      .findByText(/you don't have permission/)
      .should("exist");

    H.moveDashCardToTab({ tabName: "Tab 2" });

    H.saveDashboard();

    H.getDashboardCards().should("have.length", 0);
  });

  it("should leave dashboard if navigating back after initial load", () => {
    H.visitDashboardAndCreateTab({ dashboardId: ORDERS_DASHBOARD_ID });
    H.visitCollection("root");

    H.main().within(() => {
      cy.findByText("Orders in a dashboard").click();
    });
    cy.go("back");
    H.main().within(() => {
      cy.findByText("Our analytics").should("be.visible");
    });
  });

  it("should only display and fetch cards on the current tab, also in public and embedded dashboards", () => {
    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboardCards");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    cy.findByRole("heading", {
      name: "Create a new question or browse your collections for an existing one.",
    }).should("exist");
    H.dashboardGrid().should("not.exist");

    // Add card to second tab
    H.openQuestionsSidebar();
    H.sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });

    cy.wait("@cardQuery");

    H.saveDashboard();
    cy.url().should("match", /\d+\-tab\-2/); // id is not stable

    cy.wait("@saveDashboardCards").then(({ response }) => {
      cy.wrap(response.body.dashcards[1].id).as("secondTabDashcardId");
    });

    // it's possible to have two requests firing (but first one is canceled before running second)
    cy.intercept(
      "POST",
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}/query`,
      cy.spy().as("firstTabQuerySpy"),
    ).as("firstTabQuery");

    cy.get("@secondTabDashcardId").then((secondTabDashcardId) => {
      cy.intercept(
        "POST",
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}/query`,
        cy.spy().as("secondTabQuerySpy"),
      ).as("secondTabQuery");
    });

    const firstQuestion = () => {
      return cy.request("GET", `/api/card/${ORDERS_QUESTION_ID}`).its("body");
    };
    const secondQuestion = () => {
      return cy
        .request("GET", `/api/card/${ORDERS_COUNT_QUESTION_ID}`)
        .its("body");
    };

    firstQuestion().then((r) => {
      cy.wrap(r.view_count).should("equal", 1);
    });
    secondQuestion().then((r) => {
      cy.wrap(r.view_count).should("equal", 1);
    });

    // Visit first tab and confirm only first card was queried
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.get("@firstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@secondTabQuerySpy").should("not.have.been.called");
    cy.wait("@firstTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 1 (previously) + 1 (firstQuestion)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(1); // 1 (previously)
      });
    });

    // Visit second tab and confirm only second card was queried
    H.goToTab("Tab 2");
    cy.get("@secondTabQuerySpy").should("have.been.calledOnce");
    cy.get("@firstTabQuerySpy").should("have.been.calledOnce");
    cy.wait("@secondTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 2 (previously)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 1(previously) + 1 (secondTabQuery)
      });
    });

    // Go back to first tab, expect no additional queries
    H.goToTab("Tab 1");
    cy.findAllByTestId("dashcard").contains("37.65");
    H.dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });
    cy.get("@firstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@secondTabQuerySpy").should("have.been.calledOnce");

    firstQuestion().then((r) => {
      expect(r.view_count).to.equal(2); // 2 (previously)
    });
    secondQuestion().then((r) => {
      expect(r.view_count).to.equal(2); // 2 (previously)
    });

    // Go to public dashboard
    H.updateSetting("enable-public-sharing", true);
    cy.request(
      "POST",
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/public_link`,
    ).then(({ body: { uuid } }) => {
      cy.intercept(
        "GET",
        `/api/public/dashboard/${uuid}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}?parameters=%5B%5D`,
        cy.spy().as("publicFirstTabQuerySpy"),
      ).as("publicFirstTabQuery");
      cy.get("@secondTabDashcardId").then((secondTabDashcardId) => {
        cy.intercept(
          "GET",
          `/api/public/dashboard/${uuid}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}?parameters=%5B%5D`,
          cy.spy().as("publicSecondTabQuerySpy"),
        ).as("publicSecondTabQuery");
      });

      cy.visit(`public/dashboard/${uuid}`);
    });

    // Check first tab requests
    cy.get("@publicFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuerySpy").should("not.have.been.called");
    cy.wait("@publicFirstTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(3); // 2 (previously) + 1 (publicFirstTabQuery)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(2); // 2 (previously)
      });
    });

    // Visit second tab and confirm only second card was queried
    H.goToTab("Tab 2");
    cy.get("@publicSecondTabQuerySpy").should("have.been.calledOnce");
    cy.get("@publicFirstTabQuerySpy").should("have.been.calledOnce");
    cy.wait("@publicSecondTabQuery").then((r) => {
      firstQuestion().then((r) => {
        expect(r.view_count).to.equal(3); // 3 (previously)
      });
      secondQuestion().then((r) => {
        expect(r.view_count).to.equal(3); // 2 (previously) + 1 (publicSecondTabQuery)
      });
    });

    H.goToTab("Tab 1");
    cy.get("@publicFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuerySpy").should("have.been.calledOnce");

    cy.log("static embedding");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.intercept(
      "GET",
      `/api/embed/dashboard/*/dashcard/*/card/${ORDERS_QUESTION_ID}*`,
      cy.spy().as("embedFirstTabQuerySpy"),
    ).as("embedFirstTabQuery");
    cy.intercept(
      "GET",
      `/api/embed/dashboard/*/dashcard/*/card/${ORDERS_COUNT_QUESTION_ID}*`,
      cy.spy().as("embedSecondTabQuerySpy"),
    ).as("embedSecondTabQuery");

    H.openLegacyStaticEmbeddingModal({
      resource: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
      activeTab: "parameters",
    });

    // publish the embedded dashboard so that we can directly navigate to its url
    H.publishChanges("dashboard", () => {});

    // directly navigate to the embedded dashboard, starting on Tab 1
    H.visitIframe();
    // wait for results
    cy.findAllByTestId("dashcard").contains("37.65");
    cy.get("@embedFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@embedSecondTabQuerySpy").should("not.have.been.called");

    cy.wait("@embedFirstTabQuery");

    H.goToTab("Tab 2");
    cy.get("@embedSecondTabQuerySpy").should("have.been.calledOnce");
    cy.get("@embedFirstTabQuerySpy").should("have.been.calledOnce");
    cy.wait("@embedSecondTabQuery");

    H.goToTab("Tab 1");
    cy.get("@embedFirstTabQuerySpy").should("have.been.calledOnce");
    cy.get("@embedSecondTabQuerySpy").should("have.been.calledOnce");
  });

  it("should apply filter and show loading spinner when changing tabs (#33767)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.createNewTab();
    H.saveDashboard();

    H.goToTab("Tab 2");
    H.editDashboard();
    H.openQuestionsSidebar();
    H.sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });

    H.setFilter("Date picker", "Relative Date");

    H.selectDashboardFilter(H.getDashboardCard(0), "Created At");
    H.saveDashboard();

    cy.intercept(
      "POST",
      "/api/dashboard/*/dashcard/*/card/*/query",
      delayResponse(500),
    ).as("saveCard");

    H.filterWidget().click();
    H.popover().findByText("Previous 7 days").click();

    // Loader in the 2nd tab
    H.getDashboardCard(0).within(() => {
      cy.findByTestId("loading-indicator").should("exist");
      cy.wait("@saveCard");
      cy.findAllByRole("row").should("exist");
    });

    // we do not auto-wire automatically in different tabs anymore, so first tab
    // should not show a loader and re-run query
    H.goToTab("Tab 1");
    H.getDashboardCard(0).within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findAllByRole("row").should("exist");
    });
  });

  it("should allow me to rearrange long tabs (#34970)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.createNewTab();
    H.createNewTab();

    // Assert initial tab order
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 2");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 3");

    // Prior to this bugfix, tab containing this text would be too long to drag to the left of either of the other tabs.
    const longName = "This is a really really long tab name";

    cy.findByRole("tab", { name: "Tab 3" })
      .dblclick()
      .type(`${longName}{enter}`)
      .trigger("mousedown", { button: 0, force: true })
      .trigger("mousemove", {
        button: 0,
        // You have to move the mouse at least 10 pixels to satisfy the
        // activationConstraint: { distance: 10 } in the mouseSensor. If you
        // remove that activationConstraint while still having the mouseSensor
        // (required to make this pass), then the tests in
        // DashboardTabs.unit.spec.tsx will fail.
        clientX: 11,
        clientY: 0,
      })
      .trigger("mousemove", {
        button: 0,
        clientX: 11,
        clientY: 0,
      })
      // UI requires time to update, causes flakiness without the delay
      .wait(100)
      .trigger("mouseup");

    // After the long tab is dragged, it is now in the first position. We need
    // to assert this before saving, to make sure the dragging animation
    // finishes before trying to click "Save"
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText(longName);
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 2");

    H.saveDashboard();

    // Confirm positions are the same after saving
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText(longName);
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 2");
  });
});

const CATEGORY_PARAMETER = createMockParameter({
  id: "2",
  name: "Category",
  type: "string/=",
});

const PRODUCTS_QUESTION_DETAILS = {
  name: "Products",
  query: { "source-table": PRODUCTS_ID },
};

function createMappedDashcard(mappedQuestionId) {
  return createMockDashboardCard({
    id: 1,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: CATEGORY_PARAMETER.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 0,
    col: 0,
    size_x: 10,
    size_y: 5,
  });
}

describe("scenarios > dashboard > tabs > snowplow", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when tabs are created and deleted and cards are moved between them", () => {
    const cardMovedEventName = "card_moved_to_tab";

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.assertNoUnstructuredSnowplowEvent({ event: cardMovedEventName });

    H.editDashboard();
    H.createNewTab();
    H.goToTab("Tab 1");

    H.moveDashCardToTab({ tabName: "Tab 2" });
    H.expectUnstructuredSnowplowEvent({ event: cardMovedEventName });

    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_tab_created" });

    H.editDashboard();
    H.deleteTab("Tab 1");
    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" }, 2);
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_tab_deleted" });
  });

  it("should allow the user to duplicate a dashcard and a tab", () => {
    H.createQuestion(PRODUCTS_QUESTION_DETAILS).then(
      ({ body: { id: mappedQuestionId } }) => {
        H.createDashboard({ parameters: [CATEGORY_PARAMETER] }).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [createMappedDashcard(mappedQuestionId)],
            });
            H.visitDashboard(dashboardId);
          },
        );
      },
    );

    cy.log("duplicate a dashcard");
    cy.findByLabelText("Edit dashboard").click();

    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Duplicate")
      .click();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_card_duplicated" });

    // check that the new card loads _before_ saving
    cy.findAllByText("Products").should("have.length", 2);
    // Also confirm with the card content (VIZ-289)
    cy.findAllByText("Small Marble Shoes").should("have.length", 2);

    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });

    cy.log("duplicate a tab");
    cy.findByLabelText("Edit dashboard").click();

    H.duplicateTab("Tab 1");
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_tab_duplicated" });
    H.getDashboardCard().within(() => {
      cy.findByText("Products").should("exist");
      cy.findByText("Category").should("exist");
      cy.findByText(/(Problem|Error)/i).should("not.exist");
    });
    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" }, 2);

    cy.log("the filter applies to the duplicated cards on both tabs");
    H.assertTabSelected("Copy of Tab 1");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    cy.findAllByText("Incredible Bronze Pants").should("have.length", 2);

    H.goToTab("Tab 1");
    cy.findAllByText("Incredible Bronze Pants").should("have.length", 2);
  });
});

describe("scenarios > dashboard > tabs > add a question to an empty dashboard with tabs (metabase#61013)", () => {
  const dashboardName = "Dashboard 61013";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createDashboardWithTabs({
      name: dashboardName,

      tabs: [
        {
          id: 1,
          name: "Tab 1",
        },
        {
          id: 2,
          name: "Tab 2",
        },
      ],
    });
  });

  it("should only add one card and save correctly to the dashboard when the dashboard is empty but has multiple tabs (metabase#61013)", () => {
    H.createQuestion(ORDERS_QUESTION).then(({ body }) =>
      H.visitQuestion(body.id),
    );

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Add to dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("Search…").type(dashboardName);
      cy.findByText(dashboardName).click();
      cy.findByTestId("entity-picker-select-button").click();
    });

    H.getDashboardCards().should("have.length", 1);
    H.getDashboardCard(0).within(() => {
      cy.findByText("Orders question").should("be.visible");
      cy.findByText("Showing first 2,000 rows").should("be.visible");
    });

    cy.findByTestId("edit-bar")
      .findByText("You're editing this dashboard.")
      .should("be.visible");

    H.saveDashboard();

    H.getDashboardCards().should("have.length", 1);
    H.getDashboardCard(0).within(() => {
      cy.findByText("Orders question").should("be.visible");
      cy.findByText("Showing first 2,000 rows").should("be.visible");
    });
  });

  it("should not wait for cards to load before switching to edit mode", () => {
    slowDownCardQuery();

    // visitQuestion waits for the query, which we don't want here.
    // we just want to visit the dashboard directly
    H.createQuestion(ORDERS_QUESTION, { visitQuestion: false }).then(
      ({ body }) => cy.visit(`/question/${body.id}`),
    );

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Add to dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("Search…").type(dashboardName);
      cy.findByText(dashboardName).click();
      cy.findByTestId("entity-picker-select-button").click();
    });

    cy.findByTestId("edit-bar")
      .findByText("You're editing this dashboard.")
      .should("be.visible");
    H.getDashboardCard(0)
      .findByTestId("loading-indicator")
      .should("be.visible");
  });
});

/**
 * When you need to postpone a response (to check for loading spinners or alike),
 * use this:
 *
 * `cy.intercept('POST', path, delayResponse(1000)).as('delayed')`
 *
 * `cy.wait('@delayed')` - you'll have 1000 ms until this resolves
 */
function delayResponse(delayMs) {
  return function (req) {
    req.on("response", (res) => {
      res.setDelay(delayMs);
    });
  };
}

function slowDownCardQuery() {
  return cy.intercept("POST", "/api/card/*/query", (req) => {
    req.on("response", (res) => {
      res.setDelay(300000);
    });
  });
}
