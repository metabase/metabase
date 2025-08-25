import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
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
