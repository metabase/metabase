Cypress.Commands.add(
  "isRenderedWithinViewport",
  {
    prevSubject: true,
  },
  (subject) => {
    const viewportTop = 0;

    // Retry the geometry check: callers assert this right after an action that
    // scrolls the element into view (e.g. "focus" the recently moved filter),
    // and the scroll may still be settling. Reading getBoundingClientRect once
    // races that scroll; wrapping the assertions in `.should()` lets Cypress
    // re-read the rect until it lands within the viewport (or times out).
    cy.wrap(subject).should(($subject) => {
      const viewportBottom = Cypress.$(cy.state("window")).height();
      const element = $subject[0].getBoundingClientRect();

      expect(element.top).to.be.greaterThan(viewportTop);
      expect(element.bottom).to.be.greaterThan(viewportTop);
      expect(element.top).not.to.be.greaterThan(viewportBottom);
      expect(element.bottom).not.to.be.greaterThan(viewportBottom);
    });
  },
);
