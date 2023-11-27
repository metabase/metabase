import {
  restore,
  visitQuestion,
  visitDashboard,
  openPeopleTable,
  describeEE,
  setTokenFeatures,
} from "e2e/support/helpers";

import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

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

    cy.intercept(`/api/activity/recent_views`).as("recent");
    cy.visit("/");
    cy.wait("@recent");

    cy.findByPlaceholderText("Search…").click();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("shows list of recently viewed items", () => {
    assertRecentlyViewedItem(0, "Orders in a dashboard", "Dashboard");
    assertRecentlyViewedItem(1, "Orders", "Question");
    assertRecentlyViewedItem(2, "People", "Table");
  });

  it("allows to select an item from keyboard", { tags: "@flaky" }, () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Recently viewed");
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "Enter" });

    cy.url().should("match", /\/question\/\d+-orders$/);
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
    cy.findByPlaceholderText("Search…").click();

    cy.findByTestId("recently-viewed-item").within(() => {
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
