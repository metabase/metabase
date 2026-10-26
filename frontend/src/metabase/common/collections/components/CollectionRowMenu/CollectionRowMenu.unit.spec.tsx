import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUpdateCollectionEndpoint,
  setupUpdateCollectionEndpointWithError,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Collection, EnterpriseSettings } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "../CollectionRowModal";

import { CollectionRowMenu } from "./CollectionRowMenu";

type CollectionRowMenusWithModalProps = {
  collections: Collection[];
  customArchiveMessage?: string;
};

function CollectionRowMenusWithModal({
  collections,
  customArchiveMessage,
}: CollectionRowMenusWithModalProps) {
  const [modal, setModal] = useState<CollectionRowModalState>();
  return (
    <>
      {collections.map((collection) => (
        <CollectionRowMenu
          key={collection.id}
          collection={collection}
          customArchiveMessage={customArchiveMessage}
          onOpenModal={setModal}
        />
      ))}
      <CollectionRowModal modal={modal} onClose={() => setModal(undefined)} />
    </>
  );
}

interface SetupOptions {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  collection?: Partial<Collection>;
  otherCollection?: Partial<Collection>;
  isAdmin?: boolean;
  customArchiveMessage?: string;
}

const setup = ({
  remoteSyncType,
  collection,
  otherCollection,
  isAdmin = true,
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
    <CollectionRowMenusWithModal
      collections={[
        createMockCollection(collection),
        ...(otherCollection ? [createMockCollection(otherCollection)] : []),
      ]}
      customArchiveMessage={customArchiveMessage}
    />,
    {
      storeInitialState: state,
      withUndos: true,
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
    setupUpdateCollectionEndpoint(collection);
    setup({
      collection,
      customArchiveMessage: "Custom archive warning",
    });

    await openMenu();
    await userEvent.click(getMenuItem(/Archive/));

    expect(
      await screen.findByText('Archive "Archived soon"?'),
    ).toBeInTheDocument();
    expect(screen.getByText("Custom archive warning")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(fetchMock.callHistory.called("update-collection-1")).toBe(true),
    );
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

  it("keeps a modal opened for another collection when an earlier edit finishes", async () => {
    const collection = createMockCollection({ id: 1, name: "First" });
    let finishUpdate: (collection: Collection) => void = () => undefined;
    setupUpdateCollectionEndpoint(
      collection,
      new Promise((resolve) => {
        finishUpdate = resolve;
      }),
    );
    setupCollectionByIdEndpoint({
      collections: [
        createMockCollection({ id: "root", name: "Our analytics" }),
      ],
    });
    setup({ collection, otherCollection: { id: 2, name: "Second" } });

    const [firstMenu, secondMenu] = screen.getAllByRole("button", {
      name: "Collection options",
    });
    await userEvent.click(firstMenu);
    await userEvent.click(getMenuItem(/Edit collection details/));
    await userEvent.type(screen.getByLabelText("Name"), " renamed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(secondMenu);
    await userEvent.click(getMenuItem(/Archive/));
    expect(screen.getByText('Archive "Second"?')).toBeInTheDocument();

    await act(async () => {
      finishUpdate(collection);
      await fetchMock.callHistory.flush(true);
    });

    expect(screen.getByText('Archive "Second"?')).toBeInTheDocument();
  });

  it("reports a failed undo of an unarchive", async () => {
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
    expect(
      await screen.findByText('"Archived collection" has been unarchived'),
    ).toBeInTheDocument();
    fetchMock.removeRoute(`update-collection-${collection.id}`);
    setupUpdateCollectionEndpointWithError(collection.id);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(
      await screen.findByText('"Archived collection" could not be archived'),
    ).toBeInTheDocument();
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
