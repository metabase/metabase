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

export const getDocumentCard = (name: string, expectCardExists = true) => {
  const cardsResult = documentContent()
    .findAllByTestId("card-embed-title")
    .filter((index, el) => {
      // Filter elements based on custom logic, e.g., text content, class, etc.
      return el.innerText === name;
    })
    .should("have.length", expectCardExists ? 1 : 0);

  return expectCardExists
    ? cardsResult.closest('[data-testid="document-card-embed"]')
    : cardsResult;
};

export const getDocumentCardResizeContainer = (name: string) =>
  getDocumentCard(name).closest('[data-type="resizeNode"]');

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
  }: {
    side?: "left" | "right";
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

export function getDragHandleForDocumentResizeNode(element: Cypress.Chainable) {
  return element.findByTestId("resize-node-drag-handle");
}

export function documentDoDrag(
  _handle: Cypress.Chainable<JQuery<HTMLElement>>,
  diff: { x?: number; y?: number },
) {
  _handle.then((handle) => {
    const { x: deltaX = 0, y: deltaY = 0 } = diff;

    const rect = handle[0].getBoundingClientRect();

    cy.log(`x: ${rect.x}, y: ${rect.y}, diff: ${diff}`);

    cy.wrap(handle).trigger("mousedown", {
      button: 0,
      clientX: rect.x,
      clientY: rect.y,
      force: true,
    });
    cy.get("body")
      .trigger("mousemove", {
        button: 0,
        clientX: rect.x + deltaX,
        clientY: rect.y + deltaY,
        force: true,
      })
      .trigger("mouseup");
  });
}

export function getFlexContainerForCard(name: string) {
  return getDocumentCard(name).closest('[data-type="flexContainer"]');
}

export function getResizeHandlesForFlexContianer(element: Cypress.Chainable) {
  return element.findAllByTestId("flex-container-drag-handle");
}

// Document nodes
export function getHeading1(name = "Heading 1") {
  return documentContent().findByRole("heading", {
    name,
    level: 1,
  });
}

export function getHeading2(name = "Heading 2") {
  return documentContent().findByRole("heading", {
    name,
    level: 2,
  });
}

export function getHeading3(name = "Heading 3") {
  return documentContent().findByRole("heading", {
    name,
    level: 3,
  });
}

export function getParagraph(text = "Lorem ipsum dolor sit amet.") {
  return documentContent().findByText(text).parent();
}

export function getBulletList(
  text = "Bullet A",
  container = documentContent(),
) {
  return container.findByText(text).closest("ul");
}

export function getBlockquote(
  text = "A famous quote",
  container = documentContent(),
) {
  return container.findByText(text).closest("blockquote");
}

export function getOrderedList(text = "Item 1", container = documentContent()) {
  return container.findByText(text).closest("ol");
}

export function getCodeBlock(
  text = "while (true) {}",
  container = documentContent(),
) {
  return container.findByText(text).closest("pre");
}

export function getEmbed() {
  return documentContent().findByTestId("document-card-embed");
}
