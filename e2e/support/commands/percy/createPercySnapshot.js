Cypress.Commands.add("createPercySnapshot", (name, options) => {
  cy.window().then(win => {
    // Replace dates that came from server
    win.document
      .querySelectorAll("[data-server-date]")
      .forEach(el => (el.innerHTML = "server-side date"));
  });

  cy.percySnapshot(name, options);
});
