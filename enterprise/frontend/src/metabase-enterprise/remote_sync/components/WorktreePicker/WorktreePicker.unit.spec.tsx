import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { EntityPickerModal } from "metabase/common/components/Pickers/EntityPicker";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockRemoteSyncWorktree,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const WORKTREE_COLLECTION = createMockCollection({
  id: 501,
  name: "Checked out collection",
  location: "/",
  worktree_id: 7,
  can_write: true,
});

const setup = async ({
  hasWorktrees = true,
  isAdmin = true,
  worktrees = [createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" })],
}: {
  hasWorktrees?: boolean;
  isAdmin?: boolean;
  worktrees?: RemoteSyncWorktree[];
} = {}) => {
  process.env.OVERSCAN = "20"; // for VirtualizedList overscan
  mockGetBoundingClientRect();

  setupRemoteSyncEndpoints({ worktrees });
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root", name: "Our analytics" }),
  );
  fetchMock.get("path:/api/collection/root/items", { data: [], total: 0 });
  fetchMock.get({
    url: "path:/api/collection",
    query: { "worktree-id": "7" },
    response: [createMockCollection({ id: "root" }), WORKTREE_COLLECTION],
  });
  fetchMock.get(`path:/api/collection/${WORKTREE_COLLECTION.id}/items`, {
    data: [
      createMockCollectionItem({
        id: 601,
        model: "card",
        name: "Question in the worktree",
        collection_id: 501,
      }),
    ],
    total: 1,
  });
  fetchMock.get("express:/api/collection/:id", createMockCollection({ id: 1 }));
  fetchMock.get("express:/api/collection/:id/items", { data: [], total: 0 });
  // picking an item logs it as a recent selection
  fetchMock.post("path:/api/activity/recents", 200);

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ remote_sync: true }),
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write",
  });
  setupEnterprisePlugins();

  const onChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <EntityPickerModal
      title="Pick a collection"
      onChange={onChange}
      onClose={onClose}
      models={["collection", "card", "dashboard", "dataset", "metric"]}
      options={{
        hasWorktrees,
        hasRootCollection: true,
        hasSearch: false,
        hasRecents: false,
        hasLibrary: false,
        hasPersonalCollections: false,
        hasConfirmButtons: true,
      }}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings,
      }),
    },
  );

  await waitForLoaderToBeRemoved();

  return { onChange, onClose };
};

describe("entity picker Worktrees section", () => {
  it("lets an admin drill into a worktree and select one of its collections", async () => {
    const { onChange } = await setup();

    await userEvent.click(await screen.findByText("Worktrees"));
    await userEvent.click(await screen.findByText("feature-a"));
    await userEvent.click(await screen.findByText("Checked out collection"));
    expect(
      await screen.findByText("Question in the worktree"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Select/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: WORKTREE_COLLECTION.id,
        model: "collection",
      }),
    );
  });

  it("is not offered when the picker did not opt in", async () => {
    await setup({ hasWorktrees: false });

    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
  });

  it("is not offered to non-admins", async () => {
    await setup({ isAdmin: false });

    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
  });

  it("is not offered when there are no worktrees", async () => {
    await setup({ worktrees: [] });

    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
  });
});
