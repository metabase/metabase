import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { moveDnDKitElement, navigationSidebar } from "e2e/support/helpers";

export const toggleQuestionBookmarkStatus = ({ wasSelected = false } = {}) => {
  const iconName = wasSelected ? "bookmark_filled" : "bookmark";
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.icon(iconName).click();
  });
  cy.wait("@toggleBookmark");
};

export const createAndBookmarkQuestion = (questionName: string) => {
  createSimpleQuestion(questionName);
  toggleQuestionBookmarkStatus();
};

export const createSimpleQuestion = (name: string) =>
  cy.createQuestion(
    {
      name,
      display: "table",
      database: SAMPLE_DB_ID,
      query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
      visualization_settings: {},
    },
    { visitQuestion: true },
  );

export const verifyBookmarksOrder = (expectedOrder: string[]) => {
  navigationSidebar()
    .findByLabelText(/Bookmarks/)
    .within(() => {
      cy.get("li")
        .should("have.length", expectedOrder.length)
        .each((bookmark, index) => {
          cy.wrap(bookmark).contains(expectedOrder[index]);
        });
    });
};

export const moveBookmark = (
  name: string,
  verticalDistance: number,
  {
    /** Alias for PUT request endpoint */
    putAlias = "reorderBookmarks",
  } = {},
) => {
  moveDnDKitElement(
    navigationSidebar()
      .findByLabelText(/Bookmarks/)
      .findByText(name),
    { vertical: verticalDistance },
  );
  cy.wait(`@${putAlias}`);
};
