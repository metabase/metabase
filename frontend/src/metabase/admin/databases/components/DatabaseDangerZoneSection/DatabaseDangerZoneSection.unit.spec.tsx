import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseUsageInfoEndpoint,
} from "__support__/server-mocks/database";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  Database,
  DatabaseUsageInfo,
  InitialSyncStatus,
} from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseDangerZoneSection } from "./DatabaseDangerZoneSection";

const NOT_SYNCED_DB_STATUSES: InitialSyncStatus[] = ["aborted", "incomplete"];

function getDiscardFieldValuesConfirmModal() {
  // Unjustified type cast. FIXME
  return document.querySelector(
    "[data-testid=discard-field-values-confirm-modal]",
  ) as HTMLElement;
}

function getRemoveDatabaseConfirmModal() {
  // Unjustified type cast. FIXME
  return document.querySelector(
    "[data-testid=remove-database-confirm-modal]",
  ) as HTMLElement;
}

const NO_USAGE_INFO: DatabaseUsageInfo = {
  question: 0,
  dataset: 0,
  metric: 0,
  segment: 0,
  transform: 0,
};

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
  usageInfo?: DatabaseUsageInfo;
}

function setup({
  database = createMockDatabase(),
  isAdmin = true,
  usageInfo = NO_USAGE_INFO,
}: SetupOpts = {}) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });
  setupDatabaseEndpoints(database);
  setupDatabaseUsageInfoEndpoint(database, usageInfo);

  const deleteDatabase = jest.fn().mockResolvedValue({});

  const utils = renderWithProviders(
    <DatabaseDangerZoneSection
      isAdmin={isAdmin}
      database={database}
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
      const modal = getDiscardFieldValuesConfirmModal();
      expect(within(modal).getByRole("heading")).toHaveTextContent(
        "Discard saved field values",
      );
      expect(
        within(modal).getByText("Are you sure you want to do this?"),
      ).toBeInTheDocument();
      await userEvent.click(within(modal).getByRole("button", { name: "Yes" }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            `path:/api/database/${database.id}/discard_values`,
          ),
        ).toBe(true);
      });
    });

    it("allows to cancel confirmation modal", async () => {
      const { database } = setup();

      await userEvent.click(screen.getByText(/Discard saved field values/i));
      await userEvent.click(
        within(getDiscardFieldValuesConfirmModal()).getByRole("button", {
          name: "Cancel",
        }),
      );

      expect(getDiscardFieldValuesConfirmModal()).not.toBeInTheDocument();
      expect(
        fetchMock.callHistory.called(
          `path:/api/database/${database.id}/discard_values`,
        ),
      ).toBe(false);
    });

    NOT_SYNCED_DB_STATUSES.forEach((initial_sync_status) => {
      it(`is hidden for databases with "${initial_sync_status}" sync status`, () => {
        setup({
          database: createMockDatabase({ initial_sync_status }),
        });

        expect(
          screen.queryByText(/Discard saved field values/i),
        ).not.toBeInTheDocument();
      });
    });

    it("is hidden for stub databases", () => {
      setup({ database: createMockDatabase({ is_stub: true }) });

      expect(
        screen.queryByText(/Discard saved field values/i),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Remove this database/i }),
      ).toBeInTheDocument();
    });
  });

  it("is hidden for stub databases when the user is not an admin", () => {
    setup({
      database: createMockDatabase({ is_stub: true }),
      isAdmin: false,
    });

    expect(
      screen.queryByTestId("database-danger-zone-section"),
    ).not.toBeInTheDocument();
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
      const modal = getRemoveDatabaseConfirmModal();

      // Fill in database name to confirm deletion
      await userEvent.type(
        await within(modal).findByRole("textbox"),
        database.name,
      );
      await userEvent.click(
        within(modal).getByRole("button", {
          name: "Delete this DB connection",
        }),
      );
      await waitFor(() => {
        expect(getDiscardFieldValuesConfirmModal()).not.toBeInTheDocument();
      });

      expect(getDiscardFieldValuesConfirmModal()).not.toBeInTheDocument();
      expect(deleteDatabase).toHaveBeenCalled();
    });

    it("should require confirming the removal of each kind of content that uses the database", async () => {
      const { database, deleteDatabase } = setup({
        usageInfo: {
          question: 1,
          dataset: 2,
          metric: 3,
          segment: 4,
          transform: 0,
        },
      });
      await userEvent.click(
        await screen.findByRole("button", { name: /Remove this database/i }),
      );
      const modal = getRemoveDatabaseConfirmModal();
      const deleteButton = within(modal).getByRole("button", {
        name: "Delete this DB connection",
      });

      expect(deleteButton).toBeDisabled();

      const contentCheckboxes = await Promise.all(
        [
          "Delete 1 saved question",
          "Delete 2 models",
          "Delete 3 metrics",
          "Delete 4 segments",
        ].map((label) => within(modal).findByLabelText(label)),
      );
      for (const checkbox of contentCheckboxes) {
        expect(checkbox).not.toBeChecked();
        await userEvent.click(checkbox);
        expect(checkbox).toBeChecked();
      }
      expect(
        within(modal).getByText(
          "This will delete every saved question, model, metric, and segment you’ve made that uses this data, and can’t be undone. Transforms that use this database won’t be deleted, but they will stop working.",
        ),
      ).toBeInTheDocument();
      expect(deleteButton).toBeDisabled();

      await userEvent.type(
        within(modal).getByPlaceholderText("Are you completely sure?"),
        database.name,
      );
      expect(deleteButton).toBeEnabled();

      await userEvent.click(deleteButton);
      expect(deleteDatabase).toHaveBeenCalledWith(database.id);
    });

    it("should allow delete database confirmation modal to be dismissed", async () => {
      const { database, deleteDatabase } = setup({ isAdmin: true });
      await userEvent.click(
        await screen.findByRole("button", { name: /Remove this database/i }),
      );

      within(getRemoveDatabaseConfirmModal()).getByText(
        `Delete the ${database.name} database?`,
      );
      await userEvent.click(
        await within(getRemoveDatabaseConfirmModal()).findByRole("button", {
          name: "Cancel",
        }),
      );

      expect(getDiscardFieldValuesConfirmModal()).not.toBeInTheDocument();
      expect(deleteDatabase).not.toHaveBeenCalled();
    });
  });
});
