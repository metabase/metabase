Cypress.Commands.add(
  "icon",
  {
    prevSubject: "optional",
  },
  (subject, icon_name) => {
    const SELECTOR = `.Icon-${icon_name}`;

    if (subject) {
      cy.wrap(subject).find(SELECTOR);
    } else {
      cy.get(SELECTOR);
    }
  },
);
