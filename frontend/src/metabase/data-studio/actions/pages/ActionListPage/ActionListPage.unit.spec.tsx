import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupActionsEndpoints,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { Database, WritebackAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockQueryAction,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ActionListPage } from "./ActionListPage";

type SetupOpts = {
  databases?: Database[];
  actions?: WritebackAction[];
  isAdmin?: boolean;
  hasLibrary?: boolean;
};

const ACTIONS_DATABASE = createMockDatabase({
  native_permissions: "write",
  settings: { "database-enable-actions": true },
});

function setup({
  databases = [ACTIONS_DATABASE],
  actions = [],
  isAdmin = true,
  hasLibrary = false,
}: SetupOpts) {
  setupDatabasesEndpoints(databases);
  setupActionsEndpoints(actions);
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({
        id: "root",
        name: "Root",
        namespace: "data-actions",
      }),
    ],
  });

  if (hasLibrary) {
    setupEnterpriseOnlyPlugin("library");
  }

  renderWithProviders(<Route path="/" element={<ActionListPage />} />, {
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: mockSettings({
        "token-features": createMockTokenFeatures({ library: hasLibrary }),
      }),
    }),
  });
}

describe("ActionListPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("lists actions without a model at the top level, without a root row", async () => {
    setup({
      actions: [
        createMockQueryAction({
          id: 1,
          name: "Refund order",
          collection_id: null,
        }),
      ],
    });

    expect(await screen.findByText("Refund order")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("library-page")).queryByText("Data actions"),
    ).not.toBeInTheDocument();
  });

  it("offers new actions and collections with native write on an actions-enabled database", async () => {
    setup({});

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Action", "Collection"]);
  });

  it("does not offer non-admins to create anything", async () => {
    setup({ isAdmin: false });

    expect(
      await screen.findByText("Queries that change data"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("does not offer to create anything without an actions-enabled database, but still links to the archive", async () => {
    setup({
      databases: [
        createMockDatabase({
          native_permissions: "write",
          settings: { "database-enable-actions": false },
        }),
      ],
    });

    expect(
      await screen.findByText("Queries that change data"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New action" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Data action options" }),
    );
    expect(
      screen.getByRole("menuitem", { name: /View archived actions/ }),
    ).toBeInTheDocument();
  });

  it("does not offer changing the permissions of data actions", async () => {
    setup({ hasLibrary: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Data action options" }),
    );

    expect(
      screen.getByRole("menuitem", { name: /View archived actions/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Change permissions/ }),
    ).not.toBeInTheDocument();
  });
});
