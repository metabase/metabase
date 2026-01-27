const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { advanceServerClockBy } from "../admin/performance/helpers/e2e-performance-helpers";

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

    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
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

    H.entityPickerModal().within(() => {
      cy.findByText("Select a collection").click();
      cy.findByRole("tab", { name: /Recents/ });
      cy.findByRole("tab", { name: /Collections/ });

      cy.findByText("Today");
      cy.findByText("My Fresh Collection");
    });
  });

  it("shows recently visited dashboard in entity picker", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header").icon("ellipsis").click();
    H.popover().findByText("Add to dashboard").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Add this question to a dashboard").click();
      cy.findByRole("tab", { name: /Recents/ });
      cy.findByRole("tab", { name: /Dashboards/ });

      cy.findByText("Today");
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select").click();
    });

    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}-`);
    cy.findByTestId("dashboard-header-container").findByText(
      /You're editing this dashboard/,
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
