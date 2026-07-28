import type {
  DataAppDiagnosticPayload,
  DataAppDiagnosticsReport,
} from "@metabase/embedding-sdk-react/data-app-dev";

export const DATA_APP_DEV_DIAGNOSTICS_PATH = "/__data-app/diagnostics";

const FEED = `**${DATA_APP_DEV_DIAGNOSTICS_PATH}*`;

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

export const diagnosticEntry = (
  over: Partial<DataAppDiagnosticPayload> = {},
): DataAppDiagnosticPayload => ({
  eventId: 1,
  time: Date.parse("2026-01-01T10:00:00Z"),
  kind: "error",
  summary: "boom",
  detail: null,
  hint: null,
  alert: true,
  ...over,
});

export const diagnosticsReport = (
  entries: DataAppDiagnosticPayload[],
  over: Partial<DataAppDiagnosticsReport> = {},
): DataAppDiagnosticsReport => ({
  entries,
  connection: null,
  manifest: null,
  clients: 1,
  lastReportAt: 1,
  lastRebuildAt: 1,
  nextEventId: (entries.at(-1)?.eventId ?? 0) + 1,
  sessionId: "page-1",
  ...over,
});

/**
 * Serve a fixed buffer with the dev server's contract — `startEventId`
 * filtering included — and clear it on DELETE.
 */
export function serveDiagnosticsFeed(
  entries: DataAppDiagnosticPayload[],
  reportOver: Partial<DataAppDiagnosticsReport> = {},
) {
  const buffer = [...entries];

  cy.intercept("GET", FEED, (req) => {
    const start = Number(
      new URL(req.url, "http://localhost").searchParams.get("startEventId"),
    );
    const shown = Number.isFinite(start)
      ? buffer.filter((e) => e.eventId >= start)
      : buffer;
    req.reply(diagnosticsReport(shown, reportOver));
  }).as("feed");

  cy.intercept("DELETE", FEED, (req) => {
    buffer.length = 0;
    req.reply({ statusCode: 204 });
  }).as("clear");
}

/** Fail the feed at the transport level, as a stopped dev server would. */
export function serveUnreachableDiagnosticsFeed() {
  cy.intercept("GET", FEED, { forceNetworkError: true }).as("feed");
}
