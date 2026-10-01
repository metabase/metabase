const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const advanceServerClockBy = (milliseconds) =>
  cy.request("POST", "/api/testing/set-time", { "add-ms": milliseconds });

describe("search > recently viewed", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openPeopleTable();
    cy.findByTextEnsureVisible("Address");

    // "Orders" question
    advanceServerClockBy(100);
    H.visitQuestion(ORDERS_QUESTION_ID);

    // "Orders in a dashboard" dashboard
    advanceServerClockBy(100);
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByTextEnsureVisible("Product ID");

    // inside the "Orders in a dashboard" dashboard, the order is queried again,
    // which elicits a ViewLog entry

    cy.intercept("/api/activity/recents?*").as("recent");
    //Because this is testing keyboard navigation, these tests can run in embedded mode
    H.visitFullAppEmbeddingUrl({
      url: "/",
      qs: { top_nav: true, search: true },
    });
    cy.wait("@recent");

    cy.findByPlaceholderText("Search…").click();

    cy.findByTestId("loading-indicator").should("not.exist");
  });

  it("shows an up-to-date list of recently viewed items, and allows to select an item from keyboard (metabase#36868)", () => {
    cy.findByTestId("recents-list-container").findByText("Recently viewed");
    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");

    cy.findByPlaceholderText("Search…").click();
    cy.wait("@recent");
    cy.findByTestId("loading-indicator").should("not.exist");

    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    advanceServerClockBy(100);
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "Enter" });

    cy.url().should("match", /\/question\/\d+-orders$/);
    cy.wait("@cardQuery");

    cy.findByPlaceholderText("Search…").click();
    cy.wait("@recent");

    assertRecentlyViewedItem(0, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");

    cy.intercept("/api/dataset").as("dataset");

    advanceServerClockBy(100);
    cy.findAllByTestId("recently-viewed-item-title").eq(2).click();
    cy.wait("@dataset");

    cy.findByPlaceholderText("Search…").click();
    cy.wait("@recent");

    assertRecentlyViewedItem(0, "People", "Table");
  });
});

describe("Recently Viewed > Entity Picker", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.visit("/");
  });

  it("shows recently created collection in entity picker", () => {
    H.createCollection({
      name: "My Fresh Collection",
    });

    cy.findByTestId("app-bar").button(/New/).click();
    H.popover().findByText("Dashboard").click();
    cy.findByTestId("collection-picker-button").click();

    H.entityPickerModalItem(1, "My Fresh Collection").should("be.visible");
    H.entityPickerModalItem(0, "Recent items").click();
    H.entityPickerModalItem(1, "My Fresh Collection").should("be.visible");
  });

  it("shows recently visited dashboard in entity picker", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header").icon("ellipsis").click();
    H.popover().findByText("Add to dashboard").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Add this question to a dashboard").click();
      cy.findByText("Our analytics").click();
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select").click();
    });

    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}-`);
    cy.findByTestId("dashboard-header-container").findByText(
      /You're editing this dashboard/,
    );
    H.saveDashboard();

    H.createDashboard({ name: "My Fresh Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        H.visitDashboard(dashboardId);
        H.visitQuestion(ORDERS_QUESTION_ID);

        cy.findByTestId("qb-header").icon("ellipsis").click();
        H.popover().findByText("Add to dashboard").click();

        H.entityPickerModal().within(() => {
          cy.findByText("Add this question to a dashboard").should(
            "be.visible",
          );
          cy.button("Select").should("be.enabled");
          cy.findByText("Recent items").click();
          cy.contains(
            "[data-testid=result-item]",
            "My Fresh Dashboard",
          ).click();
          cy.button("Select").click();
        });

        cy.url().should("contain", `/dashboard/${dashboardId}-`);
        cy.findByTestId("dashboard-header-container").findByText(
          /You're editing this dashboard/,
        );
      },
    );
  });
});

describe("search > recently viewed > enterprise features", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    H.createModerationReview({
      status: "verified",
      moderated_item_id: ORDERS_QUESTION_ID,
      moderated_item_type: "card",
    });

    H.visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header-left-side").find(".Icon-verified");
  });

  it("should show verified badge in the 'Recently viewed' list (metabase#18021)", () => {
    H.openCommandPalette();

    H.commandPalette().within(() => {
      cy.icon("verified_filled").should("be.visible");
    });
  });
});

const assertRecentlyViewedItem = (index, title, type) => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("recently-viewed-item-title")
    .eq(index)
    .should("have.text", title);
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("result-link-wrapper").eq(index).should("have.text", type);
};
