import {
  restore,
  visitQuestion,
  visitDashboard,
  openPeopleTable,
  describeEE,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe("search > recently viewed", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openPeopleTable();
    cy.findByTextEnsureVisible("Address");

    // "Orders" question
    visitQuestion(1);

    // "Orders in a dashboard" dashboard
    visitDashboard(1);
    cy.findByTextEnsureVisible("Product ID");

    // inside the "Orders in a dashboard" dashboard, the order is queried again,
    // which elicits a ViewLog entry

    cy.visit("/");
    cy.findByPlaceholderText("Search…").click();
  });

  it("shows list of recently viewed items", () => {
    cy.findByTestId("loading-spinner").should("not.exist");

    assertRecentlyViewedItem(
      0,
      "Orders in a dashboard",
      "Dashboard",
      "/dashboard/1-orders-in-a-dashboard",
    );
    assertRecentlyViewedItem(1, "Orders", "Question", "/question/1-orders");
    assertRecentlyViewedItem(
      2,
      "People",
      "Table",
      `/question#?db=${SAMPLE_DB_ID}&table=${PEOPLE_ID}`,
    );
  });

  it("allows to select an item from keyboard", () => {
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

    visitQuestion(1);

    cy.findByTestId("qb-header-left-side").find(".Icon-verified");
  });

  it("should show verified badge in the 'Recently viewed' list (metabase#18021)", () => {
    cy.findByPlaceholderText("Search…").click();

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
