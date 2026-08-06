import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { createMockState } from "metabase/redux/store/mocks";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Card,
  CollectionItem,
  Database,
  Dataset,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDataset,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import PinnedQuestionCard from "../PinnedQuestionCard";

registerVisualizations();

const defaultCardDetails: Partial<CollectionItem> = {
  model: "card",
  collection_preview: true,
};

interface SetupOptions {
  enterprise?: boolean;
  card?: Partial<Card>;
  dataset?: Partial<Dataset>;
  databases?: Database[];
}

export function setup(
  cardDetails = defaultCardDetails,
  {
    enterprise = false,
    card: cardOverrides,
    dataset: datasetOverrides,
    databases = [],
  }: SetupOptions = {},
) {
  const card = createMockCard({
    id: 1,
    ...cardOverrides,
  });
  const collectionItem = createMockCollectionItem({
    id: card.id,
    ...cardDetails,
  });
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, createMockDataset(datasetOverrides));

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
          databases,
          questions: [card],
        }),
        settings,
      }),
    },
  );
}
