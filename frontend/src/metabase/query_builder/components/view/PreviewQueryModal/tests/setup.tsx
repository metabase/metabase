import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { PreviewQueryModal } from "..";

export interface SetupOpts {
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts = {}) => {
  const card = createMockCard();
  const state = createMockState({
    qb: createMockQueryBuilderState({ card }),
    entities: createMockEntitiesState({
      databases: [createMockDatabase()],
      questions: [card],
    }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  fetchMock.post("path:/api/dataset/native", {
    status: 500,
    body: {
      message: 'Cannot run the query: missing required parameters: #{"value"}',
    },
  });

  renderWithProviders(<PreviewQueryModal />, { storeInitialState: state });
};
