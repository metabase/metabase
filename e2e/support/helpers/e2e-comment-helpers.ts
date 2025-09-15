import type { DocumentId } from "metabase-types/api";

import { modal } from "./e2e-ui-elements-helpers";

export const Comments = {
  getDocumentNodeButton,
  getDocumentNodeButtons,
  getNewThreadInput,
  getCommentInput,
  getCommentInputs,
  getCommentByText,
  getPlaceholder,
  getEmojiPicker,
  resolveCommentByText,
  reopenCommentByText,
  openAllComments,
  reactToComment,
};

function getDocumentNodeButton({
  targetId,
  childTargetId,
  hasComments,
}: {
  targetId: DocumentId;
  childTargetId: string;
  hasComments?: boolean;
}) {
  const threadUrl = `/document/${targetId}/comments/${childTargetId}${hasComments ? "" : "?new=true"}`;

  return getDocumentNodeButtons().filter(
    (_, element) => element.getAttribute("href") === threadUrl,
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

function openAllComments() {
  cy.findByRole("link", { name: "Show all comments" }).click();
  cy.findByRole("dialog").should("contain.text", "All comments");
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
  modal().within(() => {
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
