import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import registerVisualizations from "metabase/visualizations/register";
import type { CollectionItem, CollectionItemModel } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDataset,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import PinnedQuestionCard from "./PinnedQuestionCard";

registerVisualizations();

const defaultCardDetails: Partial<CollectionItem> = {
  model: "card",
  collection_preview: true,
};

function setup(cardDetails = defaultCardDetails) {
  const card = createMockCard({
    id: 1,
  });
  const collectionItem = createMockCollectionItem({
    id: card.id,
    ...cardDetails,
  });
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, createMockDataset());
  renderWithProviders(
    <PinnedQuestionCard
      item={collectionItem}
      collection={createMockCollection(ROOT_COLLECTION)}
      onCopy={jest.fn()}
      onMove={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          questions: [card],
        }),
      }),
    },
  );
}

describe("PinnedQuestionCard", () => {
  it("should render query card once (metabase#25848)", async () => {
    setup();

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();

    expect(fetchMock.calls("path:/api/card/1/query")).toHaveLength(1);
  });
});

describe("description", () => {
  it.each<{ model: CollectionItemModel; description: string }>([
    { model: "card", description: "A question" },
    { model: "metric", description: "A metric" },
  ])(
    "should display the default description for the $model (metabase#45270)",
    async ({ model, description }) => {
      setup({ collection_preview: false, model });

      expect(await screen.findByText(description)).toBeInTheDocument();
    },
  );

  it.each<{ model: CollectionItemModel }>([
    { model: "card" },
    { model: "metric" },
  ])(
    "should display the correct item description when it is set for the $model",
    async ({ model }) => {
      setup({ collection_preview: false, model, description: "Foobar" });

      expect(await screen.findByText("Foobar")).toBeInTheDocument();
    },
  );

  it("should not display description with the preview enabled", async () => {
    setup();

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();
    expect(screen.queryByText("A question")).not.toBeInTheDocument();
  });
});
