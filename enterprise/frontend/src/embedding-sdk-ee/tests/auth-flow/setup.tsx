import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import { MOCK_INSTANCE_URL } from "embedding-sdk-bundle/test/mocks/sso";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const MOCK_DB = createSampleDatabase();

const MOCK_CARD = createMockCard({ id: 1 });

const MOCK_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});

const MOCK_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [MOCK_COLUMN],
    rows: [["Test Row"]],
  }),
});

export const setup = ({
  authConfig,
  locale,
}: Pick<MetabaseProviderProps, "authConfig" | "locale">) => {
  setupCardEndpoints(MOCK_CARD);
  setupCardQueryEndpoints(MOCK_CARD, MOCK_DATASET);
  setupCardQueryMetadataEndpoint(
    MOCK_CARD,
    createMockCardQueryMetadata({ databases: [MOCK_DB] }),
  );

  const BOBBY_TEST_COLLECTION = createMockCollection({
    archived: false,
    can_write: true,
    description: null,
    id: 1,
    location: "/",
    name: "Bobby Tables's Personal Collection",
    personal_owner_id: 100,
  });

  setupCollectionByIdEndpoint({
    collections: [BOBBY_TEST_COLLECTION],
  });

  const { state } = setupSdkState({
    sdkState: createMockSdkState({
      initStatus: createMockLoginStatusState({ status: "uninitialized" }),
    }),
  });

  const getLastUserApiCall = () =>
    fetchMock.callHistory.lastCall(`${MOCK_INSTANCE_URL}/api/user/current`);
  const getLastCardQueryApiCall = () =>
    fetchMock.callHistory.lastCall(
      `${MOCK_INSTANCE_URL}/api/card/${MOCK_CARD.id}/query`,
    );

  return {
    ...renderWithProviders(
      <ComponentProvider authConfig={authConfig} locale={locale}>
        <StaticQuestion questionId={1} />
      </ComponentProvider>,
      {
        storeInitialState: state,
      },
    ),
    getLastUserApiCall,
    getLastCardQueryApiCall,
  };
};
