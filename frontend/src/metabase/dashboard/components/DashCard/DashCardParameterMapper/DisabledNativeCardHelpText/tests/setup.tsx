import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CardType, Parameter, TokenFeatures } from "metabase-types/api";
import { createMockCard, createMockParameter } from "metabase-types/api/mocks";

import { DisabledNativeCardHelpText } from "../DisabledNativeCardHelpText";

export interface SetupOpts {
  parameter?: Parameter;
  cardType?: CardType;
  isModel?: boolean;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export const setup = ({
  parameter = createMockParameter(),
  cardType = "question",
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts = {}) => {
  const question = new Question(
    createMockCard({ type: cardType }),
    SAMPLE_METADATA,
  );

  const { render } = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(
    <DisabledNativeCardHelpText question={question} parameter={parameter} />,
  );
};
