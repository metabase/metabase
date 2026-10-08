import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupListSourceReplacementRunsEndpoint,
  setupTablesBulkEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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
  setupTablesBulkEndpoints();

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
    <Route path="/" element={<TableActionsMenu table={table} />} />,
    { storeInitialState: state, withRouter: true, withUndos: true },
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

  describe("error handling", () => {
    it.each([
      {
        item: "Re-sync schema",
        route: "tables-sync-schema",
        message: "Failed to start sync",
      },
      {
        item: "Re-scan field values",
        route: "tables-rescan-values",
        message: "Failed to start scan",
      },
      {
        item: "Discard cached field values",
        route: "tables-discard-values",
        message: "Failed to discard values",
      },
    ])(
      "shows an error toast when $item fails",
      async ({ item, route, message }) => {
        setup({ table: createMockTable({ db: createMockDatabase() }) });
        fetchMock.modifyRoute(route, { response: { status: 500 } });

        await userEvent.click(
          screen.getByRole("button", { name: "More actions" }),
        );
        await userEvent.click(
          await screen.findByRole("menuitem", { name: new RegExp(item) }),
        );

        await waitFor(() => {
          expect(
            within(screen.getByTestId("undo-list")).getByText(message),
          ).toBeInTheDocument();
        });
      },
    );
  });
});
