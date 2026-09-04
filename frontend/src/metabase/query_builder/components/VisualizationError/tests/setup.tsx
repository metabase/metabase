import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type {
  Card,
  Database,
  DatasetError,
  DatasetErrorType,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { VisualizationError } from "../VisualizationError";

export interface SetupOpts {
  database?: Database;
  card?: Card;
  error?: DatasetError;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  errorType?: DatasetErrorType;
  duration?: number;
}

export const setup = ({
  database = createMockDatabase(),
  card = createMockCard(),
  error = "An error occurred",
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
  errorType,
  duration = 0,
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
      duration={duration}
      error={error}
      errorType={errorType}
      via={[]}
    />,
    { storeInitialState: state },
  );
};
