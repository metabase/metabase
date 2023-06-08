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

describe("scenarios > dashboard > tabs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should only display cards on the selected tab", () => {
    // Create new tab
    visitDashboardAndCreateTab({ dashboardId: 1, save: false });
    dashboardCards().within(() => {
      cy.findByText("Orders").should("not.exist");
    });

    // Add card to second tab
    cy.icon("pencil").click();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });
    saveDashboard();

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
    visitDashboardAndCreateTab({ dashboardId: 1, save: false });

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

  it("should update slug in url after creating a new tab and saving", () => {
    visitDashboardAndCreateTab({ dashboardId: 1 });
    cy.url().should("include", "2-page-2");
  });

  it("should leave dashboard if navigating back after initial load", () => {
    visitDashboardAndCreateTab({ dashboardId: 1 });
    visitCollection("root");

    main().within(() => {
      cy.findByText("Orders in a dashboard").click();
    });
    cy.go("back");
    main().within(() => {
      cy.findByText("Our analytics").should("be.visible");
    });
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
    visitDashboard(1);
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
