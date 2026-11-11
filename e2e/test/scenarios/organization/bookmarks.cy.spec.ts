const { H } = cy;
import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";
import {
  FIRST_COLLECTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

describe("scenarios > organization > bookmarks", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("question", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
      cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should add, update bookmark name when question name is updated, then remove bookmark from question page", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      toggleQuestionBookmarkStatus();

      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "qb_action_panel",
      });

      H.openNavigationSidebar();
      H.navigationSidebar().within(() => {
        H.getSidebarSectionTitle(/Bookmarks/);
        cy.findByText("Orders");
      });

      // Rename bookmarked question
      cy.findByTestId("saved-question-header-title").click().type(" 2").blur();

      H.navigationSidebar().within(() => {
        cy.findByText("Orders 2");
      });

      cy.log("Turn the question into a model");
      H.openQuestionActions();
      cy.findByRole("menu").contains("Turn into a model").click();
      cy.findByRole("dialog").contains("Turn this into a model").click();

      H.undoToastList().findByText("This is a model now.");
      // Close this toast as soon we confim it exists!
      // It lingers in the UI far too long which is causing flakiness later on
      // when we assert on the next toast (when we turn the model back to the question).
      H.undoToastList().icon("close").click();

      H.openNavigationSidebar();
      H.navigationSidebar().within(() => {
        cy.findByRole("section", { name: "Bookmarks" })
          .icon("model")
          .should("exist");
      });

      cy.log("Turn the model back into a question");
      H.openQuestionActions();
      cy.findByRole("menu").contains("Turn back to saved question").click();
      H.undoToastList().should("contain", "This is a question now.");

      H.openNavigationSidebar();
      cy.log("Should not find bookmark");
      H.navigationSidebar().within(() => {
        cy.findByRole("section", { name: "Bookmarks" })
          .icon("model")
          .should("not.exist");
      });

      // Remove bookmark
      toggleQuestionBookmarkStatus({ wasSelected: true });
      H.expectUnstructuredSnowplowEvent(
        {
          event: "bookmark_added",
          event_detail: "question",
          triggered_from: "qb_action_panel",
        },
        1,
      );

      H.navigationSidebar().within(() => {
        H.getSidebarSectionTitle(/Bookmarks/).should("not.exist");
        cy.findByText("Orders 2").should("not.exist");
      });
    });
  });

  describe("reordering", () => {
    it("should reorder bookmarks by dragging them in the navigation sidebar", () => {
      createQuestionIds(["Question 1", "Question 2"]).then(
        ([question1Id, question2Id]) => {
          [question1Id, question2Id].forEach((id) =>
            cy.request("POST", `/api/bookmark/card/${id}`),
          );
          // Bookmarks created in the same second have no defined order
          cy.request("PUT", "/api/bookmark/ordering", {
            orderings: [
              { type: "card", item_id: question1Id },
              { type: "card", item_id: question2Id },
            ],
          });
          cy.intercept("PUT", "/api/bookmark/ordering").as("reorderBookmarks");

          H.visitCollection("root");
          verifyBookmarksOrder(["Question 1", "Question 2"]);

          H.navigationSidebar()
            .findByRole("section", { name: "Bookmarks" })
            .findByText("Question 2")
            .as("dragElement");
          H.moveDnDKitElementByAlias("@dragElement", { vertical: -100 });

          cy.wait("@reorderBookmarks")
            .its("request.body")
            .should("deep.equal", {
              orderings: [
                { type: "card", item_id: question2Id },
                { type: "card", item_id: question1Id },
              ],
            });
          verifyBookmarksOrder(["Question 2", "Question 1"]);

          cy.log("The new order is saved");
          cy.reload();
          verifyBookmarksOrder(["Question 2", "Question 1"]);
        },
      );
    });
  });

  describe("archiving", () => {
    it("should update bookmarks list when restoring a collection containing bookmarked items (metabase#44499)", () => {
      const collectionName = "First collection";
      const questionName = "Orders in First Collection";

      // Create a question in the collection and bookmark it
      H.createQuestion({
        name: questionName,
        query: { "source-table": STATIC_ORDERS_ID },
        collection_id: FIRST_COLLECTION_ID,
      }).then(({ body: { id: questionId } }) => {
        cy.request("POST", `/api/bookmark/card/${questionId}`);
      });

      H.visitCollection("root");

      // Verify bookmark appears in sidebar
      H.navigationSidebar()
        .findByRole("section", { name: "Bookmarks" })
        .should("contain", questionName);

      // Archive the collection
      H.openCollectionItemMenu(collectionName);
      H.popover().findByTextEnsureVisible("Move to trash").click();

      // The bookmarked question should be removed from bookmarks
      H.navigationSidebar()
        .findByRole("section", { name: "Bookmarks" })
        .should("not.exist");

      // Restore the collection
      cy.visit("/trash");
      H.openCollectionItemMenu(collectionName);
      H.popover().findByTextEnsureVisible("Restore").click();

      // The bookmarked question should reappear in bookmarks
      H.navigationSidebar()
        .findByRole("section", { name: "Bookmarks" })
        .should("contain", questionName);
    });
  });
});

function toggleQuestionBookmarkStatus({ wasSelected = false } = {}) {
  const labelText = wasSelected ? "Remove from bookmarks" : "Bookmark";
  cy.findByTestId("qb-header-action-panel").findByLabelText(labelText).click();
  cy.wait("@toggleBookmark");
}

function createQuestionIds(names: string[]): Cypress.Chainable<number[]> {
  const ids: number[] = [];
  names.forEach((name) =>
    H.createQuestion({
      name,
      query: { "source-table": STATIC_ORDERS_ID },
    }).then(({ body: { id } }) => {
      ids.push(id);
    }),
  );
  return cy.wrap(ids);
}

function verifyBookmarksOrder(expectedOrder: string[]) {
  H.navigationSidebar()
    .findByRole("section", { name: "Bookmarks" })
    .within(() => {
      cy.get("li")
        .should("have.length", expectedOrder.length)
        .each((bookmark, index) => {
          cy.wrap(bookmark).should("contain", expectedOrder[index]);
        });
    });
}
