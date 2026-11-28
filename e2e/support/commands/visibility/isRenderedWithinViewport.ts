export {};

declare global {
  namespace Cypress {
    interface Chainable {
      isRenderedWithinViewport(): Cypress.Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add(
  "isRenderedWithinViewport",
  {
    prevSubject: true,
  },
  (subject: JQuery<HTMLElement>) => {
    const viewportTop = 0;

    // Retry the geometry check: callers assert this right after an action that
    // scrolls the element into view (e.g. "focus" the recently moved filter),
    // and the scroll may still be settling. Reading getBoundingClientRect once
    // races that scroll; wrapping the assertions in `.should()` lets Cypress
    // re-read the rect until it lands within the viewport (or times out).
    cy.wrap(subject).should(($subject) => {
      // cy.state is an internal API missing from the public Cypress types.
      const cyWithState = cy as unknown as {
        state: (key: "window") => Window;
      };
      const viewportBottom =
        Cypress.$(cyWithState.state("window")).height() ?? 0;
      const element = $subject[0].getBoundingClientRect();

      expect(element.top).to.be.greaterThan(viewportTop);
      expect(element.bottom).to.be.greaterThan(viewportTop);
      expect(element.top).not.to.be.greaterThan(viewportBottom);
      expect(element.bottom).not.to.be.greaterThan(viewportBottom);
    });
  },
);
