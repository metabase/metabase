import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDataset,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import PinnedQuestionCard from "./PinnedQuestionCard";

registerVisualizations();

function setup() {
  const card = createMockCard({
    id: 1,
  });
  const collectionItem = createMockCollectionItem({
    id: card.id,
    model: "card",
    collection_preview: true,
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
