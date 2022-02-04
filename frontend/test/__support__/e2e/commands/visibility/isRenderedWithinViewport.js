Cypress.Commands.add(
  "isRenderedWithinViewport",
  {
    prevSubject: true,
  },
  subject => {
    const viewportTop = 0;
    const viewportBottom = Cypress.$(cy.state("window")).height();
    const element = subject[0].getBoundingClientRect();

    expect(element.top).to.be.greaterThan(viewportTop);
    expect(element.bottom).to.be.greaterThan(viewportTop);
    expect(element.top).not.to.be.greaterThan(viewportBottom);
    expect(element.bottom).not.to.be.greaterThan(viewportBottom);
  },
);
