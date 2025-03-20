import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
} from "__support__/server-mocks/database";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database, InitialSyncStatus } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DatabaseConnectionInfoSection } from "./DatabaseConnectionInfoSection";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

interface SetupOpts {
  database?: Database;
  mockEndpointsCb?: (database: Database) => void;
}

function setup({
  database = createMockDatabase(),
  mockEndpointsCb,
}: SetupOpts = {}) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });
  const metadata = getMetadata(state);
  setupDatabaseEndpoints(database);
  setupDatabaseUsageInfoEndpoint(database, {
    question: 0,
    dataset: 0,
    metric: 0,
    segment: 0,
  });

  mockEndpointsCb?.(database);

  // Using mockResolvedValue since the `ActionButton` component
  // this section is using expects these callbacks to be Promises
  const dismissSyncSpinner = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <DatabaseConnectionInfoSection
      database={checkNotNull(metadata.database(database.id))}
      dismissSyncSpinner={dismissSyncSpinner}
    />,
    { storeInitialState: state },
  );

  return {
    ...utils,
    database,
    dismissSyncSpinner,
  };
}

describe("DatabaseConnectionInfoSection", () => {
  describe("connection status", () => {
    it("should show success message if healthcheck returns ok", async () => {
      setup();
      expect(await screen.findByText("Loading...")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });
      expect(await screen.findByText("Connected")).toBeInTheDocument();
    });

    it("should show error message if healthcheck returns errors", async () => {
      setup({
        mockEndpointsCb: database => {
          fetchMock.get(
            `path:/api/database/${database.id}/healthcheck`,
            { body: { status: "error", message: "Test failure" } },
            { overwriteRoutes: true },
          );
        },
      });
      expect(await screen.findByText("Test failure")).toBeInTheDocument();
    });

    it("should show error message if healthcheck HTTP request fails", async () => {
      setup({
        mockEndpointsCb: database => {
          fetchMock.get(
            `path:/api/database/${database.id}/healthcheck`,
            { status: 500 },
            { overwriteRoutes: true },
          );
        },
      });
      expect(
        await screen.findByText("Failed to retrieve database health status."),
      ).toBeInTheDocument();
    });
  });

  describe("actions", () => {
    it("syncs database schema", async () => {
      const { database } = setup();
      await userEvent.click(screen.getByText(/Sync database schema/i));
      await waitFor(() => {
        expect(
          fetchMock.called(`path:/api/database/${database.id}/sync_schema`),
        ).toBe(true);
      });
    });

    it("re-scans database field values", async () => {
      const { database } = setup();
      await userEvent.click(screen.getByText(/Re-scan field values/i));
      await waitFor(() => {
        expect(
          fetchMock.called(`path:/api/database/${database.id}/rescan_values`),
        ).toBe(true);
      });
    });

    describe("sync indicator", () => {
      it("isn't shown for a fully synced database", () => {
        setup({
          database: createMockDatabase({ initial_sync_status: "complete" }),
        });

        expect(
          screen.queryByText(/Syncing database…/i),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/Dismiss sync spinner manually/i),
        ).not.toBeInTheDocument();
      });

      NOT_SYNCED_DB_STATUSES.forEach(initial_sync_status => {
        it(`is shown for a database with "${initial_sync_status}" sync status`, () => {
          setup({ database: createMockDatabase({ initial_sync_status }) });

          expect(screen.getByText(/Syncing database…/i)).toBeInTheDocument();
          expect(
            screen.getByText(/Dismiss sync spinner manually/i),
          ).toBeInTheDocument();
        });

        it(`can be dismissed for a database with "${initial_sync_status}" sync status (#20863)`, async () => {
          const database = createMockDatabase({ initial_sync_status });
          const { dismissSyncSpinner } = setup({ database });

          await userEvent.click(
            screen.getByText(/Dismiss sync spinner manually/i),
          );

          expect(dismissSyncSpinner).toHaveBeenCalledWith(database.id);
        });
      });
    });
  });
});
