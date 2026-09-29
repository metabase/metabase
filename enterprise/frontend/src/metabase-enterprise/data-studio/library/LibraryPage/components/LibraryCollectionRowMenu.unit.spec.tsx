import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCreateCollectionEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { LibraryCollectionRowMenu } from "./LibraryCollectionRowMenu";

function setup({
  collection = createMockCollection({
    id: 1,
    name: "Library Data Collection",
    type: "library-data",
    parent_id: 22,
  }),
  childCount = 0,
}: Partial<Parameters<typeof LibraryCollectionRowMenu>[0]> = {}) {
  const refreshCollections = jest.fn();
  const parentCollection = createMockCollection({
    id: 22,
    name: "Data",
    type: "library-data",
  });

  setupEnterpriseOnlyPlugin("library");
  setupEnterpriseOnlyPlugin("remote_sync");
  setupUpdateCollectionEndpoint(collection);
  setupCreateCollectionEndpoint(
    createMockCollection({ id: 99, name: "Finance", type: "library-data" }),
  );
  setupCollectionByIdEndpoint({ collections: [parentCollection, collection] });

  renderWithProviders(
    <LibraryCollectionRowMenu
      childCount={childCount}
      collection={collection}
      refreshCollections={refreshCollections}
    />,
    {
      withRouter: true,
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

  return { refreshCollections };
}

async function openMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Collection options" }),
  );
}

describe("LibraryCollectionRowMenu", () => {
  it("refreshes the parent collection after saving", async () => {
    const { refreshCollections } = setup();

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Edit collection details/ }),
    );
    await userEvent.type(screen.getByLabelText("Name"), " Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(refreshCollections).toHaveBeenCalledWith([22]);
    });
  });

  it("creates a subfolder in the clicked collection and refreshes it", async () => {
    const { refreshCollections } = setup();

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /New folder/ }));
    await userEvent.type(screen.getByLabelText("Name"), "Finance");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock.callHistory.called("create-collection")).toBe(true);
    });
    const call = fetchMock.callHistory.calls("create-collection").at(-1);
    expect(JSON.parse(String(call?.options?.body))).toMatchObject({
      name: "Finance",
      parent_id: 1,
    });

    await waitFor(() => {
      expect(refreshCollections).toHaveBeenCalledWith([1]);
    });
  });

  it("shows a table unpublish warning when archiving a non-empty Library Data collection", async () => {
    setup({ childCount: 1 });

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Archive/ }));

    expect(
      screen.getByText(
        "Archiving this collection will also unpublish the tables inside it (and any tables that depend on them) and archive any other child items.",
      ),
    ).toBeInTheDocument();
  });

  it("does not offer rename or archive on a seeded Library section, but still offers a new folder", async () => {
    setup({
      collection: createMockCollection({
        id: 22,
        name: "Data",
        type: "library-data",
        is_library_root: true,
      }),
    });

    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: /New folder/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Edit collection details/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Archive/ }),
    ).not.toBeInTheDocument();
  });
});
