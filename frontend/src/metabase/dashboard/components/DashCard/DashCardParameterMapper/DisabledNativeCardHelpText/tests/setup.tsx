import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CardType, Parameter, TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockParameter,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DisabledNativeCardHelpText } from "../DisabledNativeCardHelpText";

export interface SetupOpts {
  parameter?: Parameter;
  cardType?: CardType;
  isModel?: boolean;
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  specificPlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = ({
  parameter = createMockParameter(),
  cardType = "question",
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
  specificPlugins = [],
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });
  const question = new Question(
    createMockCard({ type: cardType }),
    SAMPLE_METADATA,
  );

  if (hasEnterprisePlugins) {
    if (specificPlugins.length > 0) {
      specificPlugins.forEach((plugin) => {
        setupEnterpriseOnlyPlugin(plugin);
      });
    } else {
      setupEnterprisePlugins();
    }
  }

  renderWithProviders(
    <DisabledNativeCardHelpText question={question} parameter={parameter} />,
    { storeInitialState: state },
  );
};
