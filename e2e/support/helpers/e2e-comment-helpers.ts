import type { DocumentId } from "metabase-types/api";

export const Comments = {
  getDocumentNodeButton,
  getDocumentNodeButtons,
  getNewThreadInput,
  getCommentInput,
  getCommentInputs,
  getCommentByText,
  getAllComments,
  getMentionDialog,
  getPlaceholder,
  getEmojiPicker,
  resolveCommentByText,
  reopenCommentByText,
  openAllComments,
  reactToComment,
  getSidebar,
  closeSidebar,
};

function getDocumentNodeButton({
  targetId,
  childTargetId,
  isCardEmbedNode,
}: {
  targetId: DocumentId;
  childTargetId: string;
  // Kept for call-site compatibility; the node comment link no longer
  // varies by comment state (see comment on threadPath below).
  hasComments?: boolean;
  isCardEmbedNode?: boolean;
}) {
  if (isCardEmbedNode) {
    return cy.findByRole("button", { name: "Comments" });
  }

  // The comment link points at the node's thread path plus whatever query
  // params are currently on the URL (`useCommentUrl` appends `location.search`).
  // It no longer carries a `?new=true` marker, so match on the path only.
  const threadPath = `/document/${targetId}/comments/${childTargetId}`;
  return getDocumentNodeButtons().filter(
    (_, element) =>
      (element.getAttribute("href") ?? "").split("?")[0] === threadPath,
  );
}

function getDocumentNodeButtons() {
  return cy.findAllByRole("link", { name: "Comments" });
}

function getNewThreadInput() {
  return cy.findByTestId("new-thread-editor");
}

function getCommentInput() {
  return cy.findByTestId("comment-editor");
}

function getCommentInputs() {
  return cy.findAllByTestId("comment-editor");
}

function getPlaceholder() {
  return cy.get("[data-placeholder]");
}

function getCommentByText(text: string | RegExp) {
  return cy.findByText(text).closest("[data-testid='discussion-comment']");
}

function getAllComments() {
  return cy.findAllByTestId("discussion-comment");
}

function openAllComments() {
  cy.findByRole("link", { name: "Show all comments" }).click();
  getSidebar().should("contain.text", "All comments");
}

function getEmojiPicker() {
  return cy.findByTestId("emoji-picker");
}

function resolveCommentByText(text: string | RegExp) {
  return getCommentByText(text)
    .realHover()
    .within(() => {
      cy.findByTestId("comment-action-panel").should("be.visible");
      cy.findByTestId("comment-action-panel-resolve")
        .should("be.visible")
        .click();
    });
}

function reopenCommentByText(text: string | RegExp) {
  return getCommentByText(text)
    .realHover()
    .within(() => {
      cy.findByTestId("comment-action-panel").should("be.visible");
      cy.findByTestId("comment-action-panel-reopen")
        .should("be.visible")
        .click();
    });
}

function reactToComment(comment: string | RegExp, emoji: string) {
  getSidebar().within(() => {
    getCommentByText(comment)
      .realHover()
      .within(() => {
        cy.findByTestId("comment-action-panel").should("be.visible");
        cy.findByRole("button", { name: "Add reaction" }).click();
      });
  });
  getEmojiPicker().within(() => {
    cy.findByText(emoji).click();
  });
}

function getSidebar() {
  return cy.findByTestId("comments-sidebar");
}

function closeSidebar() {
  cy.icon("close").click();
}

function getMentionDialog() {
  return cy.findByRole("dialog", { name: "Mention Dialog" });
}
