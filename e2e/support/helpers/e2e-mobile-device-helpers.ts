const LONG_PRESS_MS = 600;

export function enableTouchEmulation() {
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setTouchEmulationEnabled",
      params: { enabled: true, maxTouchPoints: 5 },
    }),
  );

  // Make CSS @media (hover: none) match on emulated touch devices
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setEmulatedMedia",
      params: { features: [{ name: "hover", value: "none" }] },
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

  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Emulation.setEmulatedMedia",
      params: { features: [] },
    }),
  );
}

/**
 * Dispatches a native touchstart event on the element.
 * Unlike cy.realTouch(), this fires a real DOM TouchEvent that bubbles
 * to document — needed to test Mantine's useClickOutside which listens
 * for touchstart at the document level.
 */
export function fireTouchStart(selector: string) {
  cy.findByTestId(selector).then(($el) => {
    const el = $el[0];
    const touch = new Touch({ identifier: 0, target: el });
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [touch],
      }),
    );
  });
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
    button: 0,
  });

  cy.wait(holdMs);

  cy.findByTestId(selector)
    .trigger("mousemove", endX, startY)
    .trigger("mouseup", endX, startY);
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
      button: 0,
    })
    .trigger("pointermove", endX, startY, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .trigger("pointerup", endX, startY, {
      force: true,
      isPrimary: true,
      button: 0,
    });
}
