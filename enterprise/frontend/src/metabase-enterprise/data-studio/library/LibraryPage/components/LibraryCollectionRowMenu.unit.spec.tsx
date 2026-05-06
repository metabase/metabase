import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
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
  const refreshMetricCollections = jest.fn();
  const refreshTableCollections = jest.fn();
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
    <LibraryCollectionRowMenu
      childCount={childCount}
      collection={collection}
      refreshMetricCollections={refreshMetricCollections}
      refreshTableCollections={refreshTableCollections}
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
        entities: createMockEntitiesState({ collections: [parentCollection] }),
      }),
    },
  );

  return { refreshMetricCollections, refreshTableCollections };
}

describe("LibraryCollectionRowMenu", () => {
  it("refreshes table collections after saving a Library Data collection", async () => {
    const { refreshMetricCollections, refreshTableCollections } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Collection options" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Edit collection details/ }),
    );
    await userEvent.type(screen.getByLabelText("Name"), " Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(refreshTableCollections).toHaveBeenCalledWith([22]);
    });
    expect(refreshMetricCollections).not.toHaveBeenCalled();
  });

  it("refreshes metric collections after saving a Library Metrics collection", async () => {
    const { refreshMetricCollections, refreshTableCollections } = setup({
      collection: createMockCollection({
        id: 2,
        name: "Library Metrics Collection",
        type: "library-metrics",
        parent_id: 22,
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Collection options" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Edit collection details/ }),
    );
    await userEvent.type(screen.getByLabelText("Name"), " Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(refreshMetricCollections).toHaveBeenCalledWith([22]);
    });
    expect(refreshTableCollections).not.toHaveBeenCalled();
  });

  it("shows a table unpublish warning when archiving a non-empty Library Data collection", async () => {
    setup({ childCount: 1 });

    await userEvent.click(
      screen.getByRole("button", { name: "Collection options" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /Archive/ }));

    expect(
      screen.getByText(
        "Archiving this collection will also unpublish the tables inside it and archive any other child items.",
      ),
    ).toBeInTheDocument();
  });
});
