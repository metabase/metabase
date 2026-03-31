const LONG_PRESS_MS = 600;

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

export function longPressAndDrag(
  selector: string,
  startX: number,
  startY: number,
  endX: number,
  holdMs = LONG_PRESS_MS,
) {
  cy.findByTestId(selector).trigger("pointerdown", startX, startY, {
    force: true,
    isPrimary: true,
    pointerType: "touch",
    button: 0,
  });

  cy.wait(holdMs);

  cy.findByTestId(selector)
    .trigger("pointermove", endX, startY, {
      force: true,
      isPrimary: true,
      pointerType: "touch",
      button: 0,
    })
    .trigger("pointerup", endX, startY, {
      force: true,
      isPrimary: true,
      pointerType: "touch",
      button: 0,
    });
}

export function quickSwipe(
  selector: string,
  startX: number,
  startY: number,
  endX: number,
) {
  cy.findByTestId(selector)
    .trigger("pointerdown", startX, startY, {
      force: true,
      isPrimary: true,
      pointerType: "touch",
      button: 0,
    })
    .trigger("pointermove", endX, startY, {
      force: true,
      isPrimary: true,
      pointerType: "touch",
      button: 0,
    })
    .trigger("pointerup", endX, startY, {
      force: true,
      isPrimary: true,
      pointerType: "touch",
      button: 0,
    });
}
