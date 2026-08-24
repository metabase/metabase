// Type-only SDK imports: host-app suites bundle this file with the plain
// esbuild preprocessor, which can't resolve the SDK's own deps. Helpers that
// need SDK *values* live in `e2e-data-app-dev-component-helpers`.
import type { DataAppDiagnosticsReport } from "@metabase/embedding-sdk-react/data-app-dev";

export const DATA_APP_DEV_DIAGNOSTICS_PATH = "/__data-app/diagnostics";

export const devToolbarRoot = () => cy.get("[data-cy-root]");

export const devToolbarPanel = () => cy.findByTestId("dev-toolbar-panel");

export const devToolbarToggle = () =>
  cy.findByRole("button", { name: /Diagnostics/ });

export const openDevToolbar = () => devToolbarToggle().click();

/** Tabs holding problems append a count, so match on the label prefix. */
export const devToolbarTab = (name: string) =>
  cy.findByRole("tab", { name: new RegExp(`^${name}`) });

/**
 * Poll the real diagnostics endpoint until `predicate` holds — the page's
 * reporter batches, so the feed converges rather than reflecting an event
 * instantly. Host-app suites only.
 */
export const readDiagnosticsUntil = (
  url: string,
  description: string,
  predicate: (report: DataAppDiagnosticsReport) => boolean,
  attempt = 0,
): Cypress.Chainable<DataAppDiagnosticsReport> =>
  cy
    .request<DataAppDiagnosticsReport>(url)
    .then(({ body }): Cypress.Chainable<DataAppDiagnosticsReport> => {
      if (predicate(body)) {
        return cy.wrap(body, { log: false });
      }
      if (attempt >= 30) {
        throw new Error(`Diagnostics endpoint never reported: ${description}`);
      }
      cy.wait(1000);
      return readDiagnosticsUntil(url, description, predicate, attempt + 1);
    });
