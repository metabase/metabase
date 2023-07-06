/* istanbul ignore file */

import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SnippetSidebar } from "../SnippetSidebar";

export interface SetupOpts {
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export function setup({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    // TODO
  }

  renderWithProviders(<SnippetSidebar />, { storeInitialState: state });
}
