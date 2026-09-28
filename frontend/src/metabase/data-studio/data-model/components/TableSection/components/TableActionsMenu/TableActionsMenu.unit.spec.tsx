import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupListSourceReplacementRunsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Route } from "metabase/router";
import type { Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TableActionsMenu } from "./TableActionsMenu";

interface SetupOpts {
  table: Table;
  isAdmin?: boolean;
}

function setup({ table, isAdmin = false }: SetupOpts) {
  setupListSourceReplacementRunsEndpoint([]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    }),
  });

  // The find-and-replace action comes from the replacement EE plugin, which
  // gates `canReplaceSources` on whether the current user is an admin.
  setupEnterprisePlugins();

  renderWithProviders(
    <Route
      path="/"
      element={
        <>
          <TableActionsMenu table={table} />
          <UndoListing />
        </>
      }
    />,
    { storeInitialState: state, withRouter: true },
  );
}

describe("TableActionsMenu", () => {
  it("renders a menu with sync items for a regular table", async () => {
    setup({ table: createMockTable({ db: createMockDatabase() }) });

    // it's a menu, not a standalone link
    expect(
      screen.queryByRole("link", { name: /View schema/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(
      await screen.findByRole("menuitem", { name: /View schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Re-sync schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Re-scan field values/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Discard cached field values/ }),
    ).toBeInTheDocument();
  });

  it("renders a standalone View schema button when there are no other actions", () => {
    // attached DWH => no sync items, and a non-admin can't replace sources
    setup({
      table: createMockTable({
        db: createMockDatabase({ is_attached_dwh: true }),
      }),
    });

    expect(
      screen.getByRole("link", { name: /View schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the menu when an admin can replace sources even without sync items", async () => {
    // attached DWH => no sync items, but an admin can use find-and-replace
    setup({
      table: createMockTable({
        db: createMockDatabase({ is_attached_dwh: true }),
      }),
      isAdmin: true,
    });

    // the selector keeps it a menu rather than collapsing to a button
    expect(
      screen.queryByRole("link", { name: /View schema/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(
      await screen.findByRole("menuitem", { name: /View schema/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Find and replace/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Re-sync schema/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      item: "Re-sync schema",
      path: "path:/api/data-studio/table/sync-schema",
      toast: "Sync triggered",
    },
    {
      item: "Re-scan field values",
      path: "path:/api/data-studio/table/rescan-values",
      toast: "Scan triggered",
    },
    {
      item: "Discard cached field values",
      path: "path:/api/data-studio/table/discard-values",
      toast: "Discard triggered",
    },
  ])(
    "sends the table id and confirms with a toast for $item",
    async ({ item, path, toast }) => {
      fetchMock.post(path, {});
      const table = createMockTable({ db: createMockDatabase() });
      setup({ table });

      await userEvent.click(
        screen.getByRole("button", { name: "More actions" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: new RegExp(item) }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(path, { method: "POST" }),
        ).toHaveLength(1);
      });
      const [call] = fetchMock.callHistory.calls(path, { method: "POST" });
      expect(JSON.parse(String(call.options.body))).toEqual({
        table_ids: [table.id],
      });
      expect(await screen.findByText(toast)).toBeInTheDocument();
    },
  );
});
