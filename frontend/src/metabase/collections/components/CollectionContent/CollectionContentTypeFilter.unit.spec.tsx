import userEvent from "@testing-library/user-event";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";
import { FILTERS_VISIBILITY_THRESHOLD } from "./constants";

const collection = createMockCollection({
  id: 1,
  name: "Filtered collection",
  can_write: true,
});

const dashboard = createMockCollectionItem({
  id: 1,
  name: "Revenue dashboard",
  model: "dashboard",
  collection_position: null,
});

// Enough items to keep the search input and type filters visible.
const questions = Array.from(
  { length: FILTERS_VISIBILITY_THRESHOLD + 1 },
  (_, index) =>
    createMockCollectionItem({
      id: 100 + index,
      name: `Question ${index + 1}`,
      model: "card",
      collection_position: null,
    }),
);

async function setup() {
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionItemsEndpoint({
    collection,
    collectionItems: [dashboard, ...questions],
  });
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={collection.id} />}
    />,
    { withRouter: true, withDND: true, withKBar: true },
  );
  expect(await screen.findByText(dashboard.name)).toBeInTheDocument();

  return { trackSimpleEvent };
}

describe("CollectionContent > type filter from the info panel", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("filters the list and tracks one filter event per count clicked", async () => {
    const { trackSimpleEvent } = await setup();

    await userEvent.click(screen.getByRole("button", { name: "More info" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Show only Questions" }),
    );

    expect(
      await screen.findByRole("button", { name: "Filter, filters applied" }),
    ).toBeInTheDocument();
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_items_filtered",
      event_detail: "type",
      target_id: collection.id,
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    expect(screen.getByLabelText("Question")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Dashboard"));

    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
  });
});
