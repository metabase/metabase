declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Yield the text of a CodeMirror `.cm-content` element, skipping the
       * placeholder line that stands in for an empty document.
       * It is a query, so a chained assertion re-reads the text until it passes.
       *
       * @example
       * cy.get(".cm-content").codeMirrorText().should("equal", "[Revenue]");
       */
      codeMirrorText(): Cypress.Chainable<string>;
    }
  }
}

Cypress.Commands.addQuery("codeMirrorText", function () {
  return ($content: JQuery<HTMLElement>) =>
    $content
      .find(".cm-line")
      .toArray()
      .filter((line) => !line.querySelector(".cm-placeholder"))
      .map((line) => line.textContent ?? "")
      .join("\n");
});

export {};
