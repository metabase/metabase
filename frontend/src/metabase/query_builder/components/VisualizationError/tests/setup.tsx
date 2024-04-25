import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Card, Database, TokenFeatures } from "metabase-types/api";
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
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  database = createMockDatabase(),
  card = createMockCard(),
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
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

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const metadata = createMockMetadata({
    questions: [card],
    databases: [database],
  });
  const question = checkNotNull(metadata.question(card.id));

  renderWithProviders(
    <VisualizationError
      question={question}
      duration={0}
      error="An error occurred"
      via={[]}
    />,
    { storeInitialState: state },
  );
};
