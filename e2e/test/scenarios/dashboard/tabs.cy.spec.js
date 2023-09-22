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
} from "e2e/support/helpers";

import {
  ORDERS_DASHBOARD_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard > tabs", () => {
  beforeEach(() => {
    cy.in;
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
    cy.url().should("include", "2-tab-2");

    // Go back to first tab
    cy.findByRole("tab", { name: "Tab 1" }).click();
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
    cy.findByRole("tab", { name: "Tab 1" }).click();
    dashboardCards().within(() => {
      cy.findByText("Orders").should("be.visible");
    });
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
    cy.intercept("PUT", "/api/dashboard/*/cards").as("saveDashboardCards");

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
      cy.wrap(response.body.cards[1].id).as("secondTabDashcardId");
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
    visitDashboard(ORDERS_DASHBOARD_ID, { params: { tab: 1 } });
    cy.get("@firstTabQuery").should("have.been.calledOnce");
    cy.get("@secondTabQuery").should("not.have.been.called");

    // Visit second tab and confirm only second card was queried
    cy.findByRole("tab", { name: "Tab 2" }).click();
    cy.get("@firstTabQuery").should("have.been.calledOnce");
    cy.get("@secondTabQuery").should("have.been.calledOnce");

    // Go back to first tab, expect no additional queries
    cy.findByRole("tab", { name: "Tab 1" }).click();
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
    cy.findByRole("tab", { name: "Tab 2" }).click();
    cy.get("@publicFirstTabQuery").should("have.been.calledOnce");
    cy.get("@publicSecondTabQuery").should("have.been.calledOnce");
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
    expectGoodSnowplowEvents(PAGE_VIEW_EVENT + 1); // dashboard_tab_created

    editDashboard();
    deleteTab("Tab 2");
    saveDashboard();
    expectGoodSnowplowEvents(PAGE_VIEW_EVENT + 2); // dashboard_tab_deleted
  });
});
