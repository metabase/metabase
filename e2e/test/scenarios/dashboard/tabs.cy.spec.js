import {
  restore,
  saveDashboard,
  openQuestionsSidebar,
  undo,
  dashboardCards,
  sidebar,
  visitDashboardAndCreateTab,
  describeWithSnowplow,
  resetSnowplow,
  expectNoBadSnowplowEvents,
  visitDashboard,
  editDashboard,
  createNewTab,
  expectGoodSnowplowEvents,
  enableTracking,
  deleteTab,
  visitCollection,
  main,
  getDashboardCard,
  getDashboardCards,
  getTextCardDetails,
  getHeadingCardDetails,
  getLinkCardDetails,
  updateDashboardCards,
  goToTab,
  moveDashCardToTab,
  addTextBoxWhileEditing,
  expectGoodSnowplowEvent,
  selectDashboardFilter,
  filterWidget,
  popover,
} from "e2e/support/helpers";

import {
  ORDERS_DASHBOARD_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ADMIN_PERSONAL_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard > tabs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should only display cards on the selected tab", () => {
    // Create new tab
    visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("not.exist");
      cy.findByText(`There's nothing here, yet.`).should("be.visible");
    });

    // Add card to second tab
    cy.icon("pencil").click();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });
    saveDashboard();
    cy.url().should("match", /\d+\-tab\-2/); // id is not stable

    // Go back to first tab
    goToTab("Tab 1");
    dashboardCards().within(() => {
      cy.findByText("Orders, count").should("not.exist");
    });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("should allow undoing a tab deletion", () => {
    visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    // Delete first tab
    deleteTab("Tab 1");
    cy.findByRole("tab", { name: "Tab 1" }).should("not.exist");

    // Undo then go back to first tab
    undo();
    goToTab("Tab 1");
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
  });

  it(
    "should allow moving dashcards between tabs",
    { scrollBehavior: false },
    () => {
      visitDashboardAndCreateTab({
        dashboardId: ORDERS_DASHBOARD_ID,
        save: false,
      });

      goToTab("Tab 1");

      cy.log("add second card");
      addTextBoxWhileEditing("Text card");

      cy.log("should stay on the same tab");
      cy.findByRole("tab", { selected: true }).should("have.text", "Tab 1");

      getDashboardCard(0).then(element => {
        cy.wrap({
          width: element.outerWidth(),
          height: element.outerHeight(),
        }).as("card1OriginalSize");
      });

      getDashboardCard(1).then(element => {
        cy.wrap(element.offset()).as("card2OriginalPosition");
      });

      cy.log("move second card to second tab first, then the first card");
      // moving the second card first to invert their position, this allows us
      // to check if the position is restored when undoing the movement of the second one
      moveDashCardToTab({ tabName: "Tab 2", dashcardIndex: 1 });
      moveDashCardToTab({ tabName: "Tab 2", dashcardIndex: 0 });

      cy.log("fist tab should be empty");
      cy.findAllByTestId("toast-undo").should("have.length", 2);
      getDashboardCards().should("have.length", 0);

      cy.log("should show undo toast with the correct text");
      cy.findByTestId("undo-list").within(() => {
        cy.findByText("Text card moved").should("be.visible");
        cy.findByText("Card moved: Orders").should("be.visible");
      });

      cy.log("cards should be in second tab");
      goToTab("Tab 2");
      getDashboardCards().should("have.length", 2);

      cy.log("size should stay the same");

      getDashboardCard(1).then(element => {
        cy.get("@card1OriginalSize").then(originalSize => {
          expect({
            width: element.outerWidth(),
            height: element.outerHeight(),
          }).to.deep.eq(originalSize);
        });
      });

      cy.log("undoing movement of second card");

      cy.findAllByTestId("toast-undo").eq(0).findByRole("button").click();

      goToTab("Tab 1");

      getDashboardCards().should("have.length", 1);

      cy.log("second card should be in the original position");

      getDashboardCard().then(element => {
        cy.get("@card2OriginalPosition").then(originalPosition => {
          const position = element.offset();
          // approximately to avoid possibly flakiness, we just want it to be in the same grid cell
          expect(position.left).to.approximately(originalPosition.left, 10);
          expect(position.top).to.approximately(originalPosition.top, 10);
        });
      });
    },
  );

  it(
    "should allow moving different types of dashcards to other tabs",
    // cy auto scroll makes the dashcard actions menu go under the header
    { scrollBehavior: false },
    () => {
      const cards = [
        getTextCardDetails({
          text: "Text card",
          // small card aligned to the left so that move icon is out of the viewport
          // unless the left alignment logic kicks in
          size_x: 1,
        }),
        getHeadingCardDetails({
          text: "Heading card",
        }),
        getLinkCardDetails({
          url: "https://metabase.com",
        }),
      ];

      cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
        updateDashboardCards({ dashboard_id, cards });

        visitDashboard(dashboard_id);
      });

      editDashboard();
      createNewTab();
      goToTab("Tab 1");

      cy.log("moving dashcards to second tab");

      cards.forEach(() => {
        moveDashCardToTab({ tabName: "Tab 2" });
      });

      getDashboardCards().should("have.length", 0);

      goToTab("Tab 2");

      getDashboardCards().should("have.length", cards.length);

      cy.findAllByTestId("toast-undo").should("have.length", cards.length);

      cy.log("'Undo' toasts should be dismissed when saving the dashboard");

      saveDashboard();

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
    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        collection_id: NORMAL_PERSONAL_COLLECTION_ID,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.signInAsNormalUser();
      visitDashboard(dashboard_id);
    });

    editDashboard();
    createNewTab();

    goToTab("Tab 1");

    getDashboardCard()
      .findByText(/you don't have permission/)
      .should("exist");

    moveDashCardToTab({ tabName: "Tab 2" });

    saveDashboard();

    getDashboardCards().should("have.length", 0);
  });

  it("should leave dashboard if navigating back after initial load", () => {
    visitDashboardAndCreateTab({ dashboardId: ORDERS_DASHBOARD_ID });
    visitCollection("root");

    main().within(() => {
      cy.findByText("Orders in a dashboard").click();
    });
    cy.go("back");
    main().within(() => {
      cy.findByText("Our analytics").should("be.visible");
    });
  });

  it("should only fetch cards on the current tab", () => {
    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboardCards");

    visitDashboardAndCreateTab({
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    // Add card to second tab
    cy.icon("pencil").click();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });
    saveDashboard();

    cy.wait("@saveDashboardCards").then(({ response }) => {
      cy.wrap(response.body.dashcards[1].id).as("secondTabDashcardId");
    });

    cy.intercept(
      "POST",
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}/query`,
      cy.spy().as("firstTabQuery"),
    );

    cy.get("@secondTabDashcardId").then(secondTabDashcardId => {
      cy.intercept(
        "POST",
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}/query`,
        cy.spy().as("secondTabQuery"),
      );
    });

    // Visit first tab and confirm only first card was queried
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.get("@firstTabQuery").should("have.been.calledOnce");
    cy.get("@secondTabQuery").should("not.have.been.called");

    // Visit second tab and confirm only second card was queried
    goToTab("Tab 2");
    cy.get("@firstTabQuery").should("have.been.calledOnce");
    cy.get("@secondTabQuery").should("have.been.calledOnce");

    // Go back to first tab, expect no additional queries
    goToTab("Tab 1");
    cy.get("@firstTabQuery").should("have.been.calledOnce");
    cy.get("@secondTabQuery").should("have.been.calledOnce");

    // Go to public dashboard
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    cy.request(
      "POST",
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/public_link`,
    ).then(({ body: { uuid } }) => {
      cy.intercept(
        "GET",
        `/api/public/dashboard/${uuid}/dashcard/${ORDERS_DASHBOARD_DASHCARD_ID}/card/${ORDERS_QUESTION_ID}?parameters=%5B%5D`,
        cy.spy().as("publicFirstTabQuery"),
      );
      cy.get("@secondTabDashcardId").then(secondTabDashcardId => {
        cy.intercept(
          "GET",
          `/api/public/dashboard/${uuid}/dashcard/${secondTabDashcardId}/card/${ORDERS_COUNT_QUESTION_ID}?parameters=%5B%5D`,
          cy.spy().as("publicSecondTabQuery"),
        );
      });

      cy.visit(`public/dashboard/${uuid}`);
    });

    // Check first tab requests
    cy.get("@publicFirstTabQuery").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuery").should("not.have.been.called");

    // Visit second tab and confirm only second card was queried
    goToTab("Tab 2");
    cy.get("@publicFirstTabQuery").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuery").should("have.been.calledOnce");
  });

  it("should apply filter and show loading spinner when changing tabs (#33767)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();
    createNewTab();
    saveDashboard();

    goToTab("Tab 2");
    editDashboard();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });

    cy.findByTestId("dashboard-header").within(() => {
      cy.icon("filter").click();
    });

    popover().within(() => {
      cy.contains("Time").click();
      cy.findByText("Relative Date").click();
    });

    // Auto-connection happens here
    selectDashboardFilter(getDashboardCard(0), "Created At");
    saveDashboard();

    cy.intercept(
      "POST",
      "/api/dashboard/*/dashcard/*/card/*/query",
      delayResponse(500),
    ).as("saveCard");

    filterWidget().contains("Relative Date").click();
    popover().within(() => {
      cy.findByText("Today").click();
    });

    // Loader in the 2nd tab
    getDashboardCard(0).within(() => {
      cy.findByTestId("loading-spinner").should("exist");
      cy.wait("@saveCard");
      cy.findAllByTestId("table-row").should("exist");
    });

    // Loader in the 1st tab
    goToTab("Tab 1");
    getDashboardCard(0).within(() => {
      cy.findByTestId("loading-spinner").should("exist");
      cy.wait("@saveCard");
      cy.findAllByTestId("table-row").should("exist");
    });
  });

  it("should allow me to rearrange long tabs (#34970)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();
    createNewTab();
    createNewTab();

    // Assert initial tab order
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 2");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 3");

    // Prior to this bugfix, tab containing this text would be too long to drag to the left of either of the other tabs.
    const longName =
      "This is a really, really, really, really, really long tab name";

    // Set the long tab name
    cy.findByRole("tab", { name: "Tab 3" })
      .dblclick()
      .type(`${longName}{enter}`);

    // Drag the long tab to the beginning of the tab row
    cy.findByRole("button", { name: "Tab 1" }).as("Tab 1");
    cy.findByRole("button", { name: longName }).as("LongTab");

    cy.get("@LongTab").then(target => {
      cy.get("@Tab 1").then(tab1Element => {
        const coordsDrag = tab1Element[0].getBoundingClientRect();
        cy.wrap(target)
          .should("exist")
          .trigger("mousedown", { button: 0, force: true })
          // You have to move the mouse at least 10 pixels to satisfy the
          // activationConstraint: { distance: 10 } in the mouseSensor.
          // If you remove that activationConstraint while still having the
          // mouseSensor (required to make this pass), then the tests in
          // DashboardTabs.unit.spec.tsx will fail.
          .trigger("mousemove", {
            button: 0,
            clientX: 11,
            clientY: 0,
            force: true,
          })
          .trigger("mousemove", {
            button: 0,
            clientX: coordsDrag.x,
            clientY: 0,
            force: true,
          })
          .trigger("mouseup");
      });
    });

    // Ensure the tab name has reverted to the long name after the drag has completed
    cy.findByRole("button", { name: longName });

    saveDashboard();

    // After the long tab is dragged, it is now in the first position
    cy.findAllByTestId("tab-button-input-wrapper").eq(0).findByText(longName);
    cy.findAllByTestId("tab-button-input-wrapper").eq(1).findByText("Tab 1");
    cy.findAllByTestId("tab-button-input-wrapper").eq(2).findByText("Tab 2");
  });
});

describeWithSnowplow("scenarios > dashboard > tabs", () => {
  const PAGE_VIEW_EVENT = 1;

  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when dashboard tabs are created and deleted", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    expectGoodSnowplowEvents(PAGE_VIEW_EVENT);

    editDashboard();
    createNewTab();
    saveDashboard();
    expectGoodSnowplowEvent({ event: "dashboard_saved" }, 1);
    expectGoodSnowplowEvent({ event: "dashboard_tab_created" }, 1);

    editDashboard();
    deleteTab("Tab 2");
    saveDashboard();
    expectGoodSnowplowEvent({ event: "dashboard_saved" }, 2);
    expectGoodSnowplowEvent({ event: "dashboard_tab_deleted" }, 1);
  });

  it("should send snowplow events when cards are moved between tabs", () => {
    const cardMovedEventName = "card_moved_to_tab";

    visitDashboard(ORDERS_DASHBOARD_ID);

    expectGoodSnowplowEvent(
      {
        event: cardMovedEventName,
      },
      0,
    );

    editDashboard();
    createNewTab();
    goToTab("Tab 1");

    moveDashCardToTab({ tabName: "Tab 2" });

    expectGoodSnowplowEvent(
      {
        event: cardMovedEventName,
      },
      1,
    );
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
    req.on("response", res => {
      res.setDelay(delayMs);
    });
  };
}
