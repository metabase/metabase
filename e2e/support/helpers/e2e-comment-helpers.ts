import type { DocumentId } from "metabase-types/api";

export const Comments = {
  getDocumentNodeButton,
  getDocumentNodeButtons,
  getNewThreadInput,
  getCommentInput,
  getPlaceholder,
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
  return cy.get(
    '[data-testid="comment-content"]:has([data-placeholder="Add a comment…"])',
  );
}

function getCommentInput() {
  return cy.get(
    '[data-testid="comment-content"]:has([data-placeholder="Reply…"])',
  );
}

function getPlaceholder() {
  return cy.get("[data-placeholder]");
}
