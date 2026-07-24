import {
  DataAppDevProvider,
  type DataAppDiagnosticPayload,
  type DataAppDiagnosticsReport,
  DevToolbar,
  type DevToolbarProps,
} from "@metabase/embedding-sdk-react/data-app-dev";

import { DEFAULT_SDK_AUTH_PROVIDER_CONFIG } from "e2e/support/helpers/embedding-sdk-component-testing";

const FEED = "**/__data-app/diagnostics*";

export const devToolbarRoot = () => cy.get("[data-cy-root]");

export const devToolbarPanel = () =>
  devToolbarRoot().findByTestId("dev-toolbar-panel");

export const devToolbarToggle = () =>
  devToolbarRoot().findByRole("button", { name: /Diagnostics/ });

export const openDevToolbar = () => devToolbarToggle().click();

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
 * Serve a fixed buffer, filtered by `startEventId` exactly as the dev server
 * does, and clear it on DELETE. Modelling the real contract keeps the toolbar's
 * cursor/poll logic honestly exercised.
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

export const mountDevToolbar = (props: Partial<DevToolbarProps> = {}) =>
  cy.mount(
    <DataAppDevProvider
      appSlug="sales"
      authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
    >
      <DevToolbar {...props} />
    </DataAppDevProvider>,
  );
