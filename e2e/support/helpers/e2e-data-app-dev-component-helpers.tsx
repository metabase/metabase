import {
  DEV_SESSION_ID,
  DataAppDevProvider,
  type DataAppDiagnosticPayload,
  type DataAppDiagnosticsReport,
  DevToolbar,
  type DevToolbarProps,
} from "@metabase/embedding-sdk-react/data-app-dev";

import { DATA_APP_DEV_DIAGNOSTICS_PATH } from "e2e/support/helpers/e2e-data-app-dev-helpers";
import { DEFAULT_SDK_AUTH_PROVIDER_CONFIG } from "e2e/support/helpers/embedding-sdk-component-testing";

const FEED = `**${DATA_APP_DEV_DIAGNOSTICS_PATH}*`;

/**
 * A served entry, tagged with this page's session — the toolbar shows only its
 * own page's entries, so an untagged one would be filtered out of the panel.
 */
export const diagnosticEntry = (
  over: Partial<DataAppDiagnosticPayload> = {},
): DataAppDiagnosticPayload => ({
  eventId: 1,
  sessionId: DEV_SESSION_ID,
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
  sessionId: DEV_SESSION_ID,
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

export const mountDevToolbar = (props: Partial<DevToolbarProps> = {}) =>
  cy.mount(
    <>
      <DataAppDevProvider
        appSlug="sales"
        authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
      >
        <div />
      </DataAppDevProvider>
      <DevToolbar {...props} />
    </>,
  );
