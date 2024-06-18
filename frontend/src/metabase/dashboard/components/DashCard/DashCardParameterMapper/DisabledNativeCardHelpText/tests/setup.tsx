import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Parameter, TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockParameter,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DisabledNativeCardHelpText } from "../DisabledNativeCardHelpText";

export interface SetupOpts {
  question?: Question;
  parameter?: Parameter;
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  question = new Question(createMockCard(), SAMPLE_METADATA),
  parameter = createMockParameter(),
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <DisabledNativeCardHelpText question={question} parameter={parameter} />,
    { storeInitialState: state },
  );
};
