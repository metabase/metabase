import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupUpdateCardEndpointWithError,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItemFromCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { MoveCardModal } from "./MoveCardModal";

const SERVER_MESSAGE =
  "This question can't be moved out of the Library because these Library dashboards use it: Revenue. Remove it from them first.";

const DESTINATION = createMockCollection({
  id: 11,
  name: "Destination collection",
  location: "/",
  effective_location: "/",
  can_write: true,
  here: ["card"],
  below: ["card"],
});

const DASHBOARD = createMockDashboard({ id: 5, name: "Revenue" });

const DASHBOARD_QUESTION = createMockCard({
  id: 2,
  name: "Revenue question",
  dashboard_id: DASHBOARD.id,
});

function setup() {
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
  setupDashboardEndpoints(DASHBOARD);
  setupUpdateCardEndpointWithError(DASHBOARD_QUESTION.id, {
    status: 400,
    body: SERVER_MESSAGE,
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });

  const onClose = jest.fn();
  renderWithProviders(
    <MoveCardModal card={DASHBOARD_QUESTION} onClose={onClose} />,
  );
  return { onClose };
}

describe("MoveCardModal", () => {
  it("keeps the confirmation open with the server's reason when moving a dashboard question is rejected", async () => {
    const { onClose } = setup();

    await userEvent.click(
      await screen.findByRole("link", { name: /Destination collection/ }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Move" }));
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(
      await screen.findByTestId("dashboard-to-collection-move-confirmation"),
    ).toHaveTextContent(SERVER_MESSAGE);
    expect(onClose).not.toHaveBeenCalled();
  });
});
