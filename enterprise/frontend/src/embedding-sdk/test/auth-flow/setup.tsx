import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { StaticQuestion } from "embedding-sdk/components/public";
import { renderWithSDKProviders } from "embedding-sdk/test/__support__/ui";
import type { MetabaseProviderProps } from "embedding-sdk/types/metabase-provider";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { MOCK_INSTANCE_URL } from "../mocks/sso";
import { createMockLoginStatusState, createMockSdkState } from "../mocks/state";
import { setupSdkState } from "../server-mocks/sdk-init";

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
  setupCardQueryMetadataEndpoint(MOCK_CARD, createMockCardQueryMetadata());

  const { state } = setupSdkState({
    sdkState: createMockSdkState({
      loginStatus: createMockLoginStatusState({ status: "uninitialized" }),
    }),
  });

  const getLastUserApiCall = () =>
    fetchMock.callHistory.lastCall(`${MOCK_INSTANCE_URL}/api/user/current`);
  const getLastCardQueryApiCall = () =>
    fetchMock.callHistory.lastCall(
      `${MOCK_INSTANCE_URL}/api/card/${MOCK_CARD.id}/query`,
    );

  return {
    ...renderWithSDKProviders(<StaticQuestion questionId={1} />, {
      sdkProviderProps: {
        authConfig,
        locale,
      },
      storeInitialState: state,
    }),
    getLastUserApiCall,
    getLastCardQueryApiCall,
  };
};
