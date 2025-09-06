import type { DocumentId } from "metabase-types/api";

export const Comments = {
  getDocumentNodeButton,
  getDocumentNodeButtons,
  getNewThreadInput,
  getCommentInput,
  getCommentByText,
  getPlaceholder,
  getEmojiPicker,
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

function getPlaceholder() {
  return cy.get("[data-placeholder]");
}

function getCommentByText(text: string) {
  return cy.findByText(text).closest("[data-testid='discussion-comment']");
}

function getEmojiPicker() {
  return cy.findByTestId("emoji-picker");
}
