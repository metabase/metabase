import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupUpdateCollectionEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { Collection, EnterpriseSettings } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { CollectionRowMenu } from "./CollectionRowMenu";

interface SetupOptions {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  collection?: Partial<Collection>;
  isAdmin?: boolean;
  onArchiveSuccess?: () => void;
  customArchiveMessage?: string;
}

const setup = ({
  remoteSyncType,
  collection,
  isAdmin = true,
  onArchiveSuccess,
  customArchiveMessage,
}: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures({
        library: true,
        remote_sync: true,
      }),
    }),
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });
  setupEnterpriseOnlyPlugin("library");
  setupEnterpriseOnlyPlugin("remote_sync");

  return renderWithProviders(
    <CollectionRowMenu
      collection={createMockCollection(collection)}
      customArchiveMessage={customArchiveMessage}
      onArchiveSuccess={onArchiveSuccess}
    />,
    {
      storeInitialState: state,
    },
  );
};

describe("CollectionRowMenu", () => {
  it("renders collection options menu", async () => {
    setup();
    await openMenu();
    expect(getMenuItem(/Archive/)).toBeInTheDocument();
    expect(getMenuItem(/Edit collection details/)).toBeInTheDocument();
    expect(getMenuItem(/Change permissions/)).toBeInTheDocument();
  });

  it("does not render archive and edit options when collection is root", async () => {
    setup({ collection: { id: "root" } });
    await openMenu();
    expect(queryMenuItem(/Archive/)).not.toBeInTheDocument();
    expect(queryMenuItem(/Edit collection details/)).not.toBeInTheDocument();
  });

  it("does not render the change permissions item for non-admins", async () => {
    setup({ isAdmin: false });
    await openMenu();
    expect(queryMenuItem(/Change permissions/)).not.toBeInTheDocument();
  });

  it("renders nothing if collection is not writable", () => {
    setup({ collection: { can_write: false } });
    expect(
      screen.queryByRole("button", { name: "Collection options" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing if remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("button", { name: "Collection options" }),
    ).not.toBeInTheDocument();
  });

  it("uses snippet folder labels for snippet collections", async () => {
    setup({ collection: { namespace: "snippets" } });

    await userEvent.click(
      screen.getByRole("button", { name: "Snippet folder options" }),
    );

    expect(getMenuItem(/Edit folder details/)).toBeInTheDocument();
  });

  it("does not render permissions option for transform collections", async () => {
    setup({ collection: { namespace: "transforms" } });

    await openMenu();

    expect(queryMenuItem(/Change permissions/)).not.toBeInTheDocument();
  });

  it("archives a collection after confirmation", async () => {
    const collection = createMockCollection({ id: 1, name: "Archived soon" });
    const onArchiveSuccess = jest.fn();
    setupUpdateCollectionEndpoint(collection);
    setup({
      collection,
      customArchiveMessage: "Custom archive warning",
      onArchiveSuccess,
    });

    await openMenu();
    await userEvent.click(getMenuItem(/Archive/));

    expect(
      await screen.findByText('Archive "Archived soon"?'),
    ).toBeInTheDocument();
    expect(screen.getByText("Custom archive warning")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(onArchiveSuccess).toHaveBeenCalled());
    const request = fetchMock.callHistory.lastCall(
      "update-collection-1",
    )?.request;
    expect(await request?.json()).toEqual({ archived: true });
  });

  it("unarchives an archived collection", async () => {
    const collection = createMockCollection({
      id: 1,
      name: "Archived collection",
      archived: true,
    });
    setupUpdateCollectionEndpoint(collection);
    setup({ collection });

    await userEvent.click(
      screen.getByRole("button", { name: "Unarchive collection" }),
    );

    await waitFor(() => {
      expect(fetchMock.callHistory.called("update-collection-1")).toBe(true);
    });
    const request = fetchMock.callHistory.lastCall(
      "update-collection-1",
    )?.request;
    expect(await request?.json()).toEqual({ archived: false });
  });
});

const openMenu = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Collection options" }),
  );
};
const getMenuItem = (name: RegExp) => screen.getByRole("menuitem", { name });
const queryMenuItem = (name: RegExp) =>
  screen.queryByRole("menuitem", { name });
