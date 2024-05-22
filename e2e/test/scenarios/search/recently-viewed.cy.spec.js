import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitQuestion,
  visitDashboard,
  openPeopleTable,
  describeEE,
  setTokenFeatures,
  popover,
  entityPickerModal,
  visitFullAppEmbeddingUrl,
  openCommandPalette,
  commandPalette,
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

    cy.intercept("/api/activity/recent_views").as("recent");
    //Because this is testing keyboard navigation, these tests can run in embedded mode
    visitFullAppEmbeddingUrl({ url: "/", qs: { top_nav: true, search: true } });
    cy.wait("@recent");

    cy.findByPlaceholderText("Search…").click();

    cy.findByTestId("loading-spinner").should("not.exist");
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
    cy.findByTestId("loading-spinner").should("not.exist");

    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");
    cy.findAllByTestId("recently-viewed-item-title").should("have.length", 3);

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
      cy.findByRole("tab", { name: /Recents/ });
      cy.findByRole("tab", { name: /Collections/ });

      cy.findByText("Today");
      cy.findByText("My Fresh Collection");
    });
  });

  it("shows recently visited dashboard in entity picker", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header").icon("ellipsis").click();
    popover().findByText("Add to dashboard").click();

    entityPickerModal().within(() => {
      cy.findByText("Add this question to a dashboard").click();
      cy.findByRole("tab", { name: /Recents/ });
      cy.findByRole("tab", { name: /Dashboards/ });

      cy.findByText("Today");
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select").click();
    });

    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}-`);
    cy.get("#Dashboard-Header-Container").findByText(
      /You're editing this dashboard/,
    );
  });
});

describeEE("search > recently viewed > enterprise features", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    cy.request("POST", "/api/moderation-review", {
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
