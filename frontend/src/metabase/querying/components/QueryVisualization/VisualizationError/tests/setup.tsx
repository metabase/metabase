import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createMockMetadata } from "__support__/metadata";
import { createScenario } from "__support__/scenarios";
import { createMockEntitiesState } from "__support__/store";
import { checkNotNull } from "metabase/utils/types";
import type { Card, Database, TokenFeatures } from "metabase-types/api";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";

import { VisualizationError } from "../VisualizationError";

export interface SetupOpts {
  database?: Database;
  card?: Card;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export const setup = ({
  database = createMockDatabase(),
  card = createMockCard(),
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts) => {
  const builder = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures });

  const metadata = createMockMetadata({
    questions: [card],
    databases: [database],
  });
  const question = checkNotNull(metadata.question(card.id));

  const { render } = builder.build();

  render(
    <VisualizationError
      question={question}
      duration={0}
      error="An error occurred"
      via={[]}
    />,
    {
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [database],
          questions: [card],
        }),
      },
    },
  );
};
