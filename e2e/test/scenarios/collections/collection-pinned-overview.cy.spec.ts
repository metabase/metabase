const { H } = cy;
import { ORDERS_COUNT_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const QUESTION_NAME = "Orders, Count";

describe("scenarios > collection pinned items overview", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/**/items?pinned-state*").as("getPinnedItems");
    cy.intercept("GET", "/api/**/items?models*").as("getCollectionItems");
  });

  it("should pin and unpin a question from the item menus", () => {
    cy.intercept("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`).as(
      "updateCard",
    );
    openRootCollection();
    H.getPinnedSection().should("not.exist");

    cy.log("pin the question from its row menu");
    H.openUnpinnedItemMenu(QUESTION_NAME);
    H.popover().findByText("Pin this").click();
    cy.wait("@updateCard").then(({ request, response }) => {
      expect(request.body).to.deep.equal({ collection_position: 1 });
      expect(response?.statusCode).to.eq(200);
    });

    openRootCollection();
    H.getPinnedSection().within(() => {
      cy.findByText(QUESTION_NAME).should("be.visible");
      cy.findByText("A question").should("be.visible");
    });

    cy.log("unpin the question from its pinned card menu");
    H.openPinnedItemMenu(QUESTION_NAME);
    H.popover().findByText("Unpin").click();
    cy.wait("@updateCard").then(({ request, response }) => {
      expect(request.body).to.deep.equal({ collection_position: null });
      expect(response?.statusCode).to.eq(200);
    });

    openRootCollection();
    H.getPinnedSection().should("not.exist");
    cy.findByTestId("collection-table")
      .findByText(QUESTION_NAME)
      .should("be.visible");
  });

  it("should be able to pin a visualization by dragging it up", () => {
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
    });
    openRootCollection();

    cy.findByTestId("collection-table")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .as("draggingViz");

    cy.findByTestId("pinned-items").as("pinnedItems");

    // this test can give us some degree of confidence, but its effectiveness is limited
    // because we are manually firing events on the correct elements. It doesn't seem that there's
    // a way to actually simulate the raw user interaction of dragging a certain distance in cypress.
    // this will not guarantee that the drag and drop functionality will work in the real world, e.g
    // when our various drag + drop libraries start interfering with events on one another.
    // for example, this test would not have caught https://github.com/metabase/metabase/issues/30614
    // even libraries like https://github.com/dmtrKovalenko/cypress-real-events rely on firing events
    // on specific elements rather than truly simulating mouse movements across the screen
    H.dragAndDrop("draggingViz", "pinnedItems");

    cy.findByTestId("pinned-items")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .should("exist");

    // Pinned items stay in the contents list below the pinned section
    cy.wait("@getCollectionItems");
    cy.findByTestId("collection-table")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .should("be.visible");
  });
});

const openRootCollection = () => {
  cy.visit("/collection/root");
  cy.wait(["@getPinnedItems", "@getCollectionItems"]);
};
