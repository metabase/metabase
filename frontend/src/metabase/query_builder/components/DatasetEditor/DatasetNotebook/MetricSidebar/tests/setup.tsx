import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MetricSidebar } from "../MetricSidebar";

export type SetupOpts = {
  tokenFeatures?: Partial<TokenFeatures>;
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
};

export function setup({
  tokenFeatures,
  showMetabaseLinks,
  hasEnterprisePlugins,
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<MetricSidebar />, { storeInitialState: state });
}
