Cypress.Commands.add(
  "icon",
  {
    prevSubject: "optional",
  },
  (subject, icon_name) => {
    if (subject) {
      cy.wrap(subject).within(() => {
        cy.get(`.Icon-${icon_name}`);
      });
    } else {
      cy.get(`.Icon-${icon_name}`);
    }
  },
);
