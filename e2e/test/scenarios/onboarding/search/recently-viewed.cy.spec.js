import {
  restore,
  visitQuestion,
  visitDashboard,
  openPeopleTable,
  describeEE,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe("search > recently viewed", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openPeopleTable();
    cy.findByTextEnsureVisible("Address");

    // "Orders" question
    visitQuestion(ORDERS_QUESTION_ID);

    // "Orders in a dashboard" dashboard
    visitDashboard(1);
    cy.findByTextEnsureVisible("Product ID");

    // inside the "Orders in a dashboard" dashboard, the order is queried again,
    // which elicits a ViewLog entry

    cy.visit("/");

    cy.intercept(`/api/activity/recent_views`).as("recent");
    cy.findByPlaceholderText("Search…").click();
    cy.wait("@recent");

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("shows list of recently viewed items", () => {
    assertRecentlyViewedItem(
      0,
      "Orders in a dashboard",
      "Dashboard",
      "/dashboard/1-orders-in-a-dashboard",
    );
    assertRecentlyViewedItem(
      ORDERS_QUESTION_ID,
      "Orders",
      "Question",
      `/question/${ORDERS_QUESTION_ID}-orders`,
    );
    assertRecentlyViewedItem(
      2,
      "People",
      "Table",
      `/question#?db=${SAMPLE_DB_ID}&table=${PEOPLE_ID}`,
    );
  });

  it("allows to select an item from keyboard", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Recently viewed");
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "ArrowDown" });
    cy.get("body").trigger("keydown", { key: "Enter" });

    cy.url().should("match", /\/question\/1-orders$/);
  });
});

describeEE("search > recently viewed > enterprise features", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("POST", "/api/moderation-review", {
      status: "verified",
      moderated_item_id: 1,
      moderated_item_type: "card",
    });

    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("qb-header-left-side").find(".Icon-verified");
  });

  it("should show verified badge in the 'Recently viewed' list (metabase#18021)", () => {
    cy.findByPlaceholderText("Search…").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Recently viewed")
      .parent()
      .within(() => {
        cy.findByText("Orders").closest("a").find(".Icon-verified");
      });
  });
});

const assertRecentlyViewedItem = (index, title, type, link) => {
  cy.findAllByTestId("recently-viewed-item")
    .eq(index)
    .parent()
    .should("have.attr", "href", link);

  cy.findAllByTestId("recently-viewed-item-title")
    .eq(index)
    .should("have.text", title);
  cy.findAllByTestId("recently-viewed-item-type")
    .eq(index)
    .should("have.text", type);
};
