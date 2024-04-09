import userEvent from "@testing-library/user-event";

import {
  setupCollectionsEndpoints,
  setupCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { QuestionPickerModal } from "./QuestionPickerModal";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});

const COLLECTION = createMockCollection({
  id: 1,
  name: "Growth",
});

const ROOT_CARD = createMockCollectionItem({
  id: 1,
  model: "card",
  name: "Count of orders",
});

const COLLECTION_CARD = createMockCollectionItem({
  id: 2,
  model: "card",
  name: "Popular products",
});

const DASHBOARD = createMockDashboard({
  id: 1,
  collection: ROOT_COLLECTION,
});

async function setup() {
  const onSelect = jest.fn();
  const onClose = jest.fn();

  setupCollectionsEndpoints({
    collections: [COLLECTION],
    rootCollection: ROOT_COLLECTION,
  });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [ROOT_CARD],
  });
  setupCollectionItemsEndpoint({
    collection: COLLECTION,
    collectionItems: [COLLECTION_CARD],
  });
  setupSearchEndpoints([ROOT_CARD, COLLECTION_CARD]);

  const dashboardState = createMockDashboardState({
    dashboardId: DASHBOARD.id,
    dashboards: { [DASHBOARD.id]: { ...DASHBOARD, dashcards: [] } },
  });

  renderWithProviders(
    <QuestionPickerModal opened onSelect={onSelect} onClose={onClose} />,
    {
      storeInitialState: {
        dashboard: dashboardState,
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return { onSelect, onClose };
}

describe("QuestionPickerModal", () => {
  it("should select a question from the root collection", async () => {
    const { onSelect, onClose } = await setup();

    await userEvent.click(await screen.findByText(ROOT_CARD.name));

    expect(onSelect).toHaveBeenCalledWith(ROOT_CARD.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("should select a question from a nested collection", async () => {
    const { onSelect, onClose } = await setup();

    await userEvent.click(screen.getByText(COLLECTION.name));
    await userEvent.click(await screen.findByText(COLLECTION_CARD.name));

    expect(onSelect).toHaveBeenCalledWith(COLLECTION_CARD.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("should search for cards", async () => {
    const { onSelect, onClose } = await setup();
    expect(screen.getByText(ROOT_CARD.name)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search/), "Popular");
    act(() => jest.runAllTimers());

    expect(await screen.findByText(COLLECTION_CARD.name)).toBeInTheDocument();
    expect(screen.queryByText(ROOT_CARD.name)).not.toBeInTheDocument();
    expect(screen.queryByText(ROOT_COLLECTION.name)).not.toBeInTheDocument();
    expect(screen.queryByText(COLLECTION.name)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText(COLLECTION_CARD.name));

    expect(onSelect).toHaveBeenCalledWith(COLLECTION_CARD.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("should have an empty search state", async () => {
    await setup();
    expect(screen.getByText(ROOT_CARD.name)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search/), "No match");
    act(() => jest.runAllTimers());

    expect(await screen.findByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByText(COLLECTION_CARD.name)).not.toBeInTheDocument();
    expect(screen.queryByText(ROOT_CARD.name)).not.toBeInTheDocument();
    expect(screen.queryByText(ROOT_COLLECTION.name)).not.toBeInTheDocument();
    expect(screen.queryByText(COLLECTION.name)).not.toBeInTheDocument();
  });

  it("should close", async () => {
    const { onSelect, onClose } = await setup();

    await userEvent.click(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
