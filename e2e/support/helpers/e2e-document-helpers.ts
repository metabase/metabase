import type { CommentId, DocumentId } from "metabase-types/api";

export const documentContent = () => cy.findByTestId("document-content");

export const documentSaveButton = () =>
  cy.findByRole("button", { name: "Save" });

export const documentFormattingMenu = () =>
  cy.findByTestId("document-formatting-menu");

export const addToDocument = (text: string, newLine: boolean = true) => {
  cy.realType(text);
  if (newLine) {
    cy.realType("{enter}");
  }
};

export const clearDocumentContent = () => {
  documentContent().type("{selectAll}{backspace}");
};

export const documentSuggestionDialog = () =>
  cy.findByRole("dialog", { name: "Mention Dialog" });

export const documentSuggestionItem = (name: RegExp | string) =>
  documentSuggestionDialog().findByRole("option", { name });

export const commandSuggestionDialog = () =>
  cy.findByRole("dialog", { name: "Command Dialog" });

export const documentMetabotDialog = () =>
  cy.findByRole("dialog", { name: "Metabot dialog" });

export const documentMetabotSuggestionItem = (name: RegExp | string) =>
  documentMetabotDialog().findByRole("option", { name });

export const commandSuggestionItem = (name: RegExp | string) =>
  commandSuggestionDialog().findByRole("option", { name });

export const getDocumentCard = (name: string) =>
  documentContent()
    .findAllByTestId("document-card-embed")
    .contains('[data-testid="document-card-embed"]', name);

export const assertDocumentCardVizType = (name: string, type: string) =>
  getDocumentCard(name).find(`[data-viz-ui-name=${type}]`);

export const getDocumentSidebar = () =>
  cy.findByTestId("document-card-sidebar");

export const openDocumentCardMenu = (name: string) => {
  getDocumentCard(name)
    .findByRole("button", { name: /ellipsis/ })
    .click();
};

export function visitDocument(documentIdOrAlias: DocumentId | string) {
  if (typeof documentIdOrAlias === "number") {
    visitDocumentById(documentIdOrAlias);
  }

  if (typeof documentIdOrAlias === "string") {
    cy.get(documentIdOrAlias).then((id) => visitDocumentById(Number(id)));
  }
}

export function visitDocumentComment(
  documentIdOrAlias: DocumentId | string,
  nodeId: string,
  commentId?: CommentId,
) {
  if (typeof documentIdOrAlias === "number") {
    visitDocumentCommentById(documentIdOrAlias, nodeId, commentId);
  }

  if (typeof documentIdOrAlias === "string") {
    cy.get(documentIdOrAlias).then((id) =>
      visitDocumentCommentById(Number(id), nodeId, commentId),
    );
  }
}

function visitDocumentCommentById(
  documentId: DocumentId | string,
  nodeId: string,
  commentId?: CommentId,
) {
  const alias = `documentQuery-${documentId}`;
  cy.intercept("GET", `/api/ee/document/${documentId}`).as(alias);

  const hash = commentId == null ? "" : `#comment-${commentId}`;
  cy.visit(`/document/${documentId}/comments/${nodeId}${hash}`);

  cy.wait(`@${alias}`);
}

const visitDocumentById = (id: DocumentId) => {
  const alias = `documentQuery-${id}`;
  cy.intercept("GET", `/api/ee/document/${id}`).as(alias);

  cy.visit(`/document/${id}`);

  cy.wait(`@${alias}`);
};
