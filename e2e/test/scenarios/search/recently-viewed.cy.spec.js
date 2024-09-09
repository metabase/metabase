import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  commandPalette,
  createModerationReview,
  describeEE,
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalTab,
  openCommandPalette,
  openPeopleTable,
  popover,
  restore,
  setTokenFeatures,
  visitDashboard,
  visitFullAppEmbeddingUrl,
  visitQuestion,
} from "e2e/support/helpers";

describe("search > recently viewed", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openPeopleTable();
    cy.findByTextEnsureVisible("Address");

    // "Orders" question
    visitQuestion(ORDERS_QUESTION_ID);

    // "Orders in a dashboard" dashboard
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByTextEnsureVisible("Product ID");

    // inside the "Orders in a dashboard" dashboard, the order is queried again,
    // which elicits a ViewLog entry

    cy.intercept("/api/activity/recents?*").as("recent");
    //Because this is testing keyboard navigation, these tests can run in embedded mode
    visitFullAppEmbeddingUrl({ url: "/", qs: { top_nav: true, search: true } });
    cy.wait("@recent");

    cy.findByPlaceholderText("Search…").click();

    cy.findByTestId("loading-indicator").should("not.exist");
  });

  it("shows list of recently viewed items", () => {
    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");
  });

  it("allows to select an item from keyboard", () => {
    cy.findByTestId("recents-list-container").findByText("Recently viewed");
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "Enter" });

    cy.url().should("match", /\/question\/\d+-orders$/);
  });

  it("shows up-to-date list of recently viewed items after another page is visited (metabase#36868)", () => {
    cy.findByPlaceholderText("Search…").click();
    cy.wait("@recent");
    cy.findByTestId("loading-indicator").should("not.exist");
    cy.log("check output");
    cy.wait(10000);

    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");

    const recentlyViewedItems = cy.findAllByTestId(
      "recently-viewed-item-title",
    );

    cy.intercept("/api/dataset").as("dataset");

    recentlyViewedItems.eq(2).click();
    cy.wait("@dataset");

    cy.findByPlaceholderText("Search…").click();
    cy.wait("@recent");

    assertRecentlyViewedItem(0, "People", "Table");
  });
});

describe("Recently Viewed > Entity Picker", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/");
  });

  it("shows recently created collection in entity picker", () => {
    cy.createCollection({
      name: "My Fresh Collection",
    });

    cy.findByTestId("app-bar").button(/New/).click();
    popover().findByText("Dashboard").click();
    cy.findByTestId("collection-picker-button").click();

    entityPickerModal().within(() => {
      cy.findByText("Select a collection").click();
      entityPickerModalTab("Recents").should("be.visible");
      entityPickerModalTab("Collections").should("be.visible");

      entityPickerModalItem("Today").should("be.visible");
      entityPickerModalItem("My Fresh Collection").should("be.visible");
    });
  });

  it("shows recently visited dashboard in entity picker", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header").icon("ellipsis").click();
    popover().findByText("Add to dashboard").click();

    entityPickerModal().within(() => {
      cy.findByText("Add this question to a dashboard").click();

      entityPickerModalTab("Recents").should("be.visible");
      entityPickerModalTab("Dashboards").should("be.visible");

      entityPickerModalItem("Today").should("be.visible");
      entityPickerModalItem("Orders in a dashboard").click();
      cy.button("Select").click();
    });

    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}-`);
    cy.findByTestId("dashboard-header-container").findByText(
      /You're editing this dashboard/,
    );
  });
});

describeEE("search > recently viewed > enterprise features", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    createModerationReview({
      status: "verified",
      moderated_item_id: ORDERS_QUESTION_ID,
      moderated_item_type: "card",
    });

    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header-left-side").find(".Icon-verified");
  });

  it("should show verified badge in the 'Recently viewed' list (metabase#18021)", () => {
    openCommandPalette();

    commandPalette().within(() => {
      cy.icon("verified_filled").should("be.visible");
    });
  });
});

const assertRecentlyViewedItem = (index, title, type) => {
  cy.findAllByTestId("recently-viewed-item-title")
    .eq(index)
    .should("have.text", title);
  cy.findAllByTestId("result-link-wrapper").eq(index).should("have.text", type);
};
