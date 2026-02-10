/**
 * Clear the browser cache.
 *
 * Cypress clears the browser cache automatically when it start up, but it doesn't
 * clear the cache between tests. Use this helper if you need to clear the cache.
 */
export function clearBrowserCache() {
  return cy.wrap(
    Cypress.automation("remote:debugger:protocol", {
      command: "Network.clearBrowserCache",
    }),
  );
}

export function grantClipboardPermissions() {
  Cypress.automation("remote:debugger:protocol", {
    command: "Browser.grantPermissions",
    params: {
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      origin: window.location.origin,
    },
  });
}

export function readClipboard() {
  return cy.window().then((win) => {
    return win.navigator.clipboard.readText();
  });
}

const isMac = Cypress.platform === "darwin";
export const metaKey = isMac ? "Meta" : "Control";
