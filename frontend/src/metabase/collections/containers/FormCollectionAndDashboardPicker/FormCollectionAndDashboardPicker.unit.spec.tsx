import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { FormProvider } from "metabase/forms";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { FormCollectionAndDashboardPicker } from "./FormCollectionAndDashboardPicker";

const rootCollection = createMockCollection(ROOT_COLLECTION);

const collection1 = createMockCollection({
  id: 11,
  name: "First Collection",
  here: ["card"],
  below: ["card"],
  location: "/",
  can_write: true,
});

const rootCollectionItems = [
  createMockCollectionItem({
    id: 11,
    model: "collection",
    name: collection1.name,
    here: ["collection"],
    below: ["collection", "card"],
    collection_id: null,
    can_write: true,
  }),
];

function setup({ models }: { models: OmniPickerItem["model"][] }) {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [collection1],
    rootCollection,
  });
  setupCollectionByIdEndpoint({ collections: [collection1] });
  setupRootCollectionItemsEndpoint({ rootCollectionItems });
  setupCollectionItemsEndpoint({
    collection: collection1,
    collectionItems: [],
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });

  renderWithProviders(
    <FormProvider
      initialValues={{ collection_id: "root", dashboard_id: undefined }}
      onSubmit={jest.fn()}
    >
      <FormCollectionAndDashboardPicker
        collectionIdFieldName="collection_id"
        dashboardIdFieldName="dashboard_id"
        title="Where do you want to save this?"
        collectionPickerModalProps={{ models }}
      />
    </FormProvider>,
  );
}

describe("FormCollectionAndDashboardPicker", () => {
  it('should show "New dashboard" button when models include "dashboard"', async () => {
    setup({ models: ["collection", "dashboard"] });

    await userEvent.click(
      screen.getByTestId("dashboard-and-collection-picker-button"),
    );
    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByRole("button", { name: /new dashboard/i }),
    ).toBeInTheDocument();
  });

  it('should not show "New dashboard" button when models do not include "dashboard"', async () => {
    setup({ models: ["collection"] });

    await userEvent.click(
      screen.getByTestId("dashboard-and-collection-picker-button"),
    );
    await waitForLoaderToBeRemoved();

    // Wait for picker content to load
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new dashboard/i }),
    ).not.toBeInTheDocument();
  });
});
