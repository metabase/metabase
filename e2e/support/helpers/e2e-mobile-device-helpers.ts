export function enableTouchEmulation() {
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setTouchEmulationEnabled",
      params: { enabled: true, maxTouchPoints: 5 },
    }),
  );

  cy.window().its("navigator.maxTouchPoints").should("be.greaterThan", 0);
}

export function disableTouchEmulation() {
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setTouchEmulationEnabled",
      params: { enabled: false },
    }),
  );
}
