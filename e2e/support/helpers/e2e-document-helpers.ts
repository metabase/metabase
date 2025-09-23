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
    .findAllByTestId("card-embed-title")
    .filter((index, el) => {
      // Filter elements based on custom logic, e.g., text content, class, etc.
      return el.innerText === name;
    })
    .should("have.length", 1)
    .closest('[data-testid="document-card-embed"]');

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

export function dragAndDropCardOnAnotherCard(
  sourceCardTitle: string,
  targetCardTitle: string,
  {
    side = "left",
    waitBeforeDrop = false,
  }: {
    side?: "left" | "right";
    waitBeforeDrop?: boolean;
  } = {},
) {
  // Perform drag and drop: drag sourceCard card onto targetCard
  getDocumentCard(sourceCardTitle)
    .should("exist")
    .then(($ordersCard) => {
      getDocumentCard(targetCardTitle)
        .should("exist")
        .then(($ordersCountCard) => {
          const sourceRect = $ordersCard[0].getBoundingClientRect();

          // Start drag from center of Orders card
          getDocumentCard(sourceCardTitle).trigger("mousedown", {
            x: 10,
            y: 10,
            scrollBehavior: false,
            force: true,
          });
          const dataTransfer = new DataTransfer();
          getDocumentCard(sourceCardTitle).trigger("dragstart", {
            dataTransfer,
            clientX: sourceRect.left + 10,
            clientY: sourceRect.top + 10,
            scrollBehavior: false,
            force: true,
          });

          if (waitBeforeDrop) {
            cy.wait(200);
          }

          const targetRect = $ordersCountCard[0].getBoundingClientRect();
          // Calculate position for target card side drop (20% from left or 20% from right based on 'side' param)
          const sideX =
            targetRect.left + targetRect.width * (side === "left" ? 0.2 : 0.8);
          const centerY = targetRect.top + 10;
          documentContent().trigger("mousemove", {
            clientX: sideX,
            clientY: centerY,
            scrollBehavior: false,
          });
          getDocumentCard(targetCardTitle).trigger("dragover", {
            clientX: sideX,
            clientY: centerY,
            scrollBehavior: false,
            force: true,
          });

          if (waitBeforeDrop) {
            cy.wait(200);
          }

          getDocumentCard(sourceCardTitle).realMouseUp({
            scrollBehavior: false,
          });
          getDocumentCard(targetCardTitle).trigger("drop", {
            dataTransfer,
            clientX: sideX,
            clientY: centerY,
            scrollBehavior: false,
            force: true,
          });
          getDocumentCard(sourceCardTitle).trigger("dragend", {
            scrollBehavior: false,
            force: true,
          });
        });
    });
}

export function documentUndo() {
  const macOSX = Cypress.platform === "darwin";

  documentContent()
    .get('[contenteditable="true"]')
    .click()
    .type(macOSX ? "{cmd+z}" : "{ctrl+z}", {
      scrollBehavior: false,
      force: true,
    });
}
