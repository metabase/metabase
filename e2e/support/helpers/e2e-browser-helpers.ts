/**
 * Clear the browser cache.
 *
 * Cypress clears the browser cache automatically when it start up, but it doesn't
 * clear the cache between tests. Use this helper if you need to clear the cache.
 */
export function clearBrowserCache() {
  return cy
    .then(() => {
      // HTTP cache
      return Cypress.automation("remote:debugger:protocol", {
        command: "Network.clearBrowserCache",
      });
    })
    .then(() => {
      // Cache Storage + Service Workers for current origin
      return cy.location("origin").then((origin) =>
        Cypress.automation("remote:debugger:protocol", {
          command: "Storage.clearDataForOrigin",
          params: {
            origin,
            storageTypes: "cache_storage,service_workers,appcache",
          },
        }),
      );
    })
    .then(() => {
      // (optional) cookies
      return Cypress.automation("remote:debugger:protocol", {
        command: "Network.clearBrowserCookies",
      });
    });
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
