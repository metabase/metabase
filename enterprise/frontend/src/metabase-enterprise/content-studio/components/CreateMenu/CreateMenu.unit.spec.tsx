import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRemoteSyncEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import type { Collection, RemoteSyncType } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockRemoteSyncWorktree,
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../../scope";

import { CreateMenu } from "./CreateMenu";

const WORKTREE = createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" });

const MAIN_COLLECTION = createMockCollection({
  id: 10,
  name: "Analytics",
  can_write: true,
  is_remote_synced: true,
});

const BRANCH_COLLECTION = createMockCollection({
  id: 11,
  name: "Analytics",
  can_write: true,
  is_remote_synced: true,
  worktree_id: WORKTREE.id,
});

const READ_ONLY_COLLECTION = createMockCollection({
  id: 15,
  name: "Analytics",
  can_write: false,
  is_remote_synced: true,
});

type SetupOpts = {
  collection?: Collection;
  remoteSyncType?: RemoteSyncType;
};

function setup({
  collection = MAIN_COLLECTION,
  remoteSyncType = "read-write",
}: SetupOpts = {}) {
  setupRemoteSyncEndpoints({ worktrees: [WORKTREE] });
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupRecentViewsAndSelectionsEndpoints([]);
  fetchMock.post("path:/api/dashboard", createMockDashboard({ id: 20 }));

  setupEnterpriseOnlyPlugin("remote_sync");

  const storeInitialState = createMockState({
    currentUser: createMockUser({
      is_superuser: true,
      permissions: createMockUserPermissions({ can_create_queries: true }),
    }),
    settings: mockSettings({
      "remote-sync-enabled": true,
      "remote-sync-branch": "main",
      "remote-sync-type": remoteSyncType,
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
  });

  renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
          </ContentStudioScopeProvider>
        }
      >
        <Route
          path="collections"
          element={<CreateMenu collection={collection} />}
        />
      </Route>
    </Route>,
    {
      initialRoute: "/content-studio/collections",
      withRouter: true,
      storeInitialState,
    },
  );
}

async function openMenu() {
  await userEvent.click(await screen.findByRole("button", { name: /New/ }));
}

describe("CreateMenu", () => {
  afterEach(() => {
    reinitialize();
  });

  it("offers question, dashboard and collection", async () => {
    setup();
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Question/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Dashboard/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Collection/ }),
    ).toBeInTheDocument();
  });

  it("starts a new question in the collection on screen", async () => {
    setup({ collection: BRANCH_COLLECTION });
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Question/ }),
    ).toHaveAttribute("href", expect.stringContaining("/question/notebook#"));
  });

  it("is hidden for a collection the user cannot write", () => {
    setup({ collection: READ_ONLY_COLLECTION, remoteSyncType: "read-only" });

    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("stays available inside a branch on a read-only instance", async () => {
    setup({ collection: BRANCH_COLLECTION, remoteSyncType: "read-only" });

    expect(
      await screen.findByRole("button", { name: /New/ }),
    ).toBeInTheDocument();
  });

  describe("new dashboard", () => {
    it("saves into a branch collection without offering a picker", async () => {
      setup({ collection: BRANCH_COLLECTION });
      await openMenu();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Dashboard/ }),
      );

      const modal = await screen.findByTestId("new-dashboard-modal");
      expect(
        screen.queryByText("Which collection should this go in?"),
      ).not.toBeInTheDocument();

      await userEvent.type(
        await screen.findByLabelText("Name"),
        "Weekly numbers",
      );
      await userEvent.click(
        await within(modal).findByRole("button", { name: "Create" }),
      );

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls("path:/api/dashboard", {
          method: "POST",
        });
        expect(calls).toHaveLength(1);
      });

      const [call] = fetchMock.callHistory.calls("path:/api/dashboard", {
        method: "POST",
      });
      expect(await call.request?.json()).toEqual(
        expect.objectContaining({ collection_id: BRANCH_COLLECTION.id }),
      );
    });

    it("keeps the picker in the main branch", async () => {
      setup();
      await openMenu();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Dashboard/ }),
      );

      expect(
        await screen.findByText("Which collection should this go in?"),
      ).toBeInTheDocument();
    });
  });

  describe("new collection", () => {
    it("creates inside a branch collection without offering a picker", async () => {
      setup({ collection: BRANCH_COLLECTION });
      await openMenu();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Collection/ }),
      );

      expect(
        await screen.findByTestId("new-collection-modal"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Collection it's saved in"),
      ).not.toBeInTheDocument();
    });

    it("keeps the picker in the main branch", async () => {
      setup();
      await openMenu();
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Collection/ }),
      );

      expect(
        await screen.findByText("Collection it's saved in"),
      ).toBeInTheDocument();
    });
  });
});
