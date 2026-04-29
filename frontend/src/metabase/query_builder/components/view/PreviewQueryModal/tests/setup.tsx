import fetchMock from "fetch-mock";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import { createMockEntitiesState } from "__support__/store";
import { createMockQueryBuilderState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockNativeCard,
} from "metabase-types/api/mocks";

import { PreviewQueryModal } from "..";

export interface SetupOpts {
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export const setup = ({
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts = {}) => {
  const card = createMockNativeCard();

  fetchMock.post("path:/api/dataset/native", {
    status: 500,
    body: {
      message: 'Cannot run the query: missing required parameters: #{"value"}',
    },
  });

  const { render } = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<PreviewQueryModal />, {
    storeInitialState: {
      qb: createMockQueryBuilderState({ card }),
      entities: createMockEntitiesState({
        databases: [createMockDatabase()],
        questions: [card],
      }),
    },
  });
};
