import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MetricEditorSidebar } from "../MetricEditorSidebar";

export type SetupOpts = {
  tokenFeatures?: Partial<TokenFeatures>;
  showMetabaseLinks?: boolean;
  specificPlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
};

export function setup({
  tokenFeatures,
  showMetabaseLinks,
  specificPlugins = [],
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  specificPlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(<MetricEditorSidebar />, { storeInitialState: state });
}
