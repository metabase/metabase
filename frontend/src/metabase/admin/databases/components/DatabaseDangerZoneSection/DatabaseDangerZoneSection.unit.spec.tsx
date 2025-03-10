import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
} from "__support__/server-mocks/database";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database, InitialSyncStatus } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DatabaseDangerZoneSection } from "./DatabaseDangerZoneSection";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

function getModal() {
  return document.querySelector("[data-testid=modal]") as HTMLElement;
}

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
}

function setup({
  database = createMockDatabase(),
  isAdmin = true,
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

  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <DatabaseDangerZoneSection
      isAdmin={isAdmin}
      database={checkNotNull(metadata.database(database.id))}
      deleteDatabase={deleteDatabase}
    />,
    { storeInitialState: state },
  );

  return {
    ...utils,
    database,
    deleteDatabase,
  };
}

describe("DatabaseDangerZoneSection", () => {
  describe("discard saved field values", () => {
    it("discards field values", async () => {
      const { database } = setup();

      await userEvent.click(screen.getByText(/Discard saved field values/i));
      await userEvent.click(
        within(getModal()).getByRole("button", { name: "Yes" }),
      );

      await waitFor(() => {
        expect(
          fetchMock.called(`path:/api/database/${database.id}/discard_values`),
        ).toBe(true);
      });
    });

    it("allows to cancel confirmation modal", async () => {
      const { database } = setup();

      await userEvent.click(screen.getByText(/Discard saved field values/i));
      await userEvent.click(
        within(getModal()).getByRole("button", { name: "Cancel" }),
      );

      expect(getModal()).not.toBeInTheDocument();
      expect(
        fetchMock.called(`path:/api/database/${database.id}/discard_values`),
      ).toBe(false);
    });

    NOT_SYNCED_DB_STATUSES.forEach(initial_sync_status => {
      it(`is hidden for databases with "${initial_sync_status}" sync status`, () => {
        setup({
          database: createMockDatabase({ initial_sync_status }),
        });

        expect(
          screen.queryByText(/Discard saved field values/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("remove database", () => {
    it("should not show remove db action to non-admins", () => {
      setup({ isAdmin: false });
      expect(
        screen.queryByRole("button", { name: /Remove this database/i }),
      ).not.toBeInTheDocument();
    });

    it("should allow admins to remove a database", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      await userEvent.click(
        await screen.findByRole("button", { name: /Remove this database/i }),
      );
      const modal = getModal();

      // Fill in database name to confirm deletion
      await userEvent.type(
        await within(modal).findByRole("textbox"),
        database.name,
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete" }),
      );
      await waitFor(() => {
        expect(getModal()).not.toBeInTheDocument();
      });

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).toHaveBeenCalled();
    });

    it("should allow delete database confirmation modal to be dismissed", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      await userEvent.click(
        await screen.findByRole("button", { name: /Remove this database/i }),
      );
      const modal = getModal();

      within(modal).getByText(`Delete the ${database.name} database?`);
      await userEvent.click(
        await within(modal).findByRole("button", { name: "Cancel" }),
      );

      expect(getModal()).not.toBeInTheDocument();
      expect(deleteDatabase).not.toHaveBeenCalled();
    });
  });
});
