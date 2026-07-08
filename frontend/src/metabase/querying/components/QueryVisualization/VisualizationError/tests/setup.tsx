import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { checkNotNull } from "metabase/utils/types";
import type {
  Card,
  Database,
  DatasetError,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { VisualizationError } from "../VisualizationError";

export interface SetupOpts {
  database?: Database;
  card?: Card;
  // `DatasetError` doesn't model it, but at runtime the component is also handed
  // thrown `Error` instances (network/stream failures), so allow them here too.
  error?: DatasetError | Error;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = ({
  database = createMockDatabase(),
  card = createMockCard(),
  error = "An error occurred",
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: [card],
    }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  setupUserMetabotPermissionsEndpoint();

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  const metadata = createMockMetadata({
    questions: [card],
    databases: [database],
  });
  const question = checkNotNull(metadata.question(card.id));

  renderWithProviders(
    <VisualizationError
      question={question}
      duration={0}
      error={error as DatasetError}
      via={[]}
    />,
    { storeInitialState: state },
  );
};
