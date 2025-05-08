import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import registerVisualizations from "metabase/visualizations/register";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDataset,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import PinnedQuestionCard from "../PinnedQuestionCard";

registerVisualizations();

const defaultCardDetails: Partial<CollectionItem> = {
  model: "card",
  collection_preview: true,
};

export function setup(
  cardDetails = defaultCardDetails,
  { enterprise } = { enterprise: false },
) {
  const card = createMockCard({
    id: 1,
  });
  const collectionItem = createMockCollectionItem({
    id: card.id,
    ...cardDetails,
  });
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, createMockDataset());

  const settings = mockSettings(
    createMockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
      }),
    }),
  );

  if (enterprise) {
    setupEnterprisePlugins();
  }

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
        settings,
      }),
    },
  );
}
