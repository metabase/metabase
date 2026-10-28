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
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCollection,
  createMockCollectionItemFromCollection,
} from "metabase-types/api/mocks";

import { ArchivedEntityBanner } from "./ArchivedEntityBanner";

const DESTINATION = createMockCollection({
  id: 10,
  name: "Destination collection",
  location: "/",
  can_write: true,
  here: ["dashboard"],
  below: ["dashboard"],
});

describe("ArchivedEntityBanner", () => {
  it("shows the server's reason when a move is rejected", async () => {
    process.env.OVERSCAN = "20";
    mockGetBoundingClientRect();
    const collections = [DESTINATION];
    setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
    setupDatabasesEndpoints([]);
    setupCollectionsEndpoints({
      collections,
      rootCollection: createMockCollection(ROOT_COLLECTION),
    });
    setupCollectionByIdEndpoint({ collections });
    setupRootCollectionItemsEndpoint({
      rootCollectionItems: collections.map(
        createMockCollectionItemFromCollection,
      ),
    });
    setupCollectionItemsEndpoint({
      collection: DESTINATION,
      collectionItems: [],
    });
    fetchMock.get("path:/api/search", { data: [] });
    fetchMock.get("path:/api/user/recipients", { data: [] });

    renderWithProviders(
      <ArchivedEntityBanner
        name="Sales"
        entityType="dashboard"
        canMove
        canRestore
        canDelete
        onUnarchive={jest.fn()}
        onMove={() =>
          Promise.reject({
            status: 400,
            data: "Dashboards can't be moved into the Library.",
          })
        }
        onDeletePermanently={jest.fn()}
      />,
    );

    // the button label is visually hidden at the narrowest breakpoint
    await userEvent.click(screen.getByText("Move"));
    await userEvent.click(
      await screen.findByRole("link", { name: /Destination collection/ }),
    );
    await userEvent.click(
      await screen.findByTestId("entity-picker-select-button"),
    );

    expect(
      await screen.findByText("Dashboards can't be moved into the Library."),
    ).toBeInTheDocument();
  });
});
