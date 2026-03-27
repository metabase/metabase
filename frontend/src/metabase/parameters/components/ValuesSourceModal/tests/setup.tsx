import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupErrorParameterValuesEndpoints,
  setupParameterValuesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTableQueryMetadataEndpoint,
  setupUnauthorizedCardsEndpoints,
  setupUnauthorizedCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Card, ParameterValues, TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockParameterValues,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import ValuesSourceModal from "../ValuesSourceModal";

export interface SetupOpts {
  parameter?: UiParameter;
  parameterValues?: ParameterValues;
  cards?: Card[];
  hasCollectionAccess?: boolean;
  hasParameterValuesError?: boolean;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = async ({
  parameter = createMockUiParameter(),
  parameterValues = createMockParameterValues(),
  cards = [],
  hasCollectionAccess = true,
  hasParameterValuesError = false,
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts = {}) => {
  const currentUser = createMockUser();
  const databases = [createMockDatabase()];
  const rootCollection = createMockCollection(ROOT_COLLECTION);
  const personalCollection = createMockCollection({
    id: currentUser.personal_collection_id,
  });
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  setupDatabasesEndpoints(databases);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([]);
  setupCollectionByIdEndpoint({
    collections: [personalCollection, rootCollection],
  });
  setupCollectionItemsEndpoint({
    collection: personalCollection,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: rootCollection,
    collectionItems: [],
  });

  if (hasCollectionAccess) {
    setupCollectionsEndpoints({ collections: [rootCollection] });
    setupCardsEndpoints(cards);
    cards.forEach((card) =>
      setupTableQueryMetadataEndpoint(
        createMockTable({
          id: `card__${card.id}`,
          fields: card.result_metadata ?? [],
        }),
      ),
    );
  } else {
    setupUnauthorizedCollectionsEndpoints([rootCollection]);
    setupUnauthorizedCardsEndpoints(cards);
  }

  if (!hasParameterValuesError) {
    setupParameterValuesEndpoints(parameterValues);
  } else {
    setupErrorParameterValuesEndpoints();
  }

  const state = createMockState({
    currentUser,
    entities: createMockEntitiesState({
      databases: [createMockDatabase()],
      questions: cards,
    }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(
    <ValuesSourceModal
      parameter={parameter}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
    {
      storeInitialState: state,
    },
  );

  await waitForLoaderToBeRemoved();

  return { onSubmit };
};
