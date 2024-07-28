import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { InteractiveEmbeddingCTA } from "metabase/public/components/EmbedModal/SelectEmbedTypePane/InteractiveEmbeddingCTA";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export type InteractiveEmbeddingCTASetupOptions = {
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
  isPaidPlan?: boolean;
};

export const setup = ({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: InteractiveEmbeddingCTASetupOptions = {}) => {
  const settings = mockSettings({ "token-features": tokenFeatures });

  const state = createMockState({
    settings,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const { history } = renderWithProviders(
    <Route path="*" component={InteractiveEmbeddingCTA}></Route>,
    {
      storeInitialState: state,
      withRouter: true,
    },
  );

  return {
    history: checkNotNull(history),
  };
};
