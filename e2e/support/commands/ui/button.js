Cypress.Commands.add(
  "button",
  {
    prevSubject: "optional",
  },
  (subject, button_name, timeout) => {
    const config = {
      name: button_name,
      timeout,
    };

    if (subject) {
      cy.wrap(subject).findByRole("button", config);
    } else {
      cy.findByRole("button", config);
    }
  },
);
