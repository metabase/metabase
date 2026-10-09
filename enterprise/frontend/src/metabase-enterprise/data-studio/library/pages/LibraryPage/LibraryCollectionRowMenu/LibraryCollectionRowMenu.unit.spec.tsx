import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  CollectionRowModal,
  type CollectionRowModalState,
} from "metabase/common/collections/components/CollectionRowModal";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { LibraryCollectionRowMenu } from "./LibraryCollectionRowMenu";

function LibraryCollectionRowMenuWithModal(
  props: Omit<ComponentProps<typeof LibraryCollectionRowMenu>, "onOpenModal">,
) {
  const [modal, setModal] = useState<CollectionRowModalState>();
  return (
    <>
      <LibraryCollectionRowMenu {...props} onOpenModal={setModal} />
      <CollectionRowModal modal={modal} onClose={() => setModal(undefined)} />
    </>
  );
}

function setup({
  collection = createMockCollection({
    id: 1,
    name: "Library Data Collection",
    type: "library-data",
    parent_id: 22,
  }),
  childCount = 0,
}: Partial<Parameters<typeof LibraryCollectionRowMenu>[0]> = {}) {
  const parentCollection = createMockCollection({
    id: 22,
    name: "Data",
    type: "library-data",
  });

  setupEnterpriseOnlyPlugin("library");
  setupEnterpriseOnlyPlugin("remote_sync");
  setupUpdateCollectionEndpoint(collection);
  setupCollectionByIdEndpoint({ collections: [parentCollection] });

  renderWithProviders(
    <LibraryCollectionRowMenuWithModal
      childCount={childCount}
      collection={collection}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            library: true,
            remote_sync: true,
          }),
        }),
      }),
    },
  );
}

describe("LibraryCollectionRowMenu", () => {
  it("shows a table unpublish warning when archiving a non-empty Library Data collection", async () => {
    setup({ childCount: 1 });

    await userEvent.click(
      screen.getByRole("button", { name: "Collection options" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /Archive/ }));

    expect(
      screen.getByText(
        "Archiving this collection will also unpublish the tables inside it (and any tables that depend on them) and archive any other child items.",
      ),
    ).toBeInTheDocument();
  });
});
