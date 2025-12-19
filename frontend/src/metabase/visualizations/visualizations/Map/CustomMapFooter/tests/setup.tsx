import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CustomMapFooter } from "../CustomMapFooter";

export interface SetupOpts {
  isAdmin: boolean;
  showMetabaseLinks: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = ({
  isAdmin,
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts) => {
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(<Route path="*" component={CustomMapFooter} />, {
    storeInitialState: state,
    withRouter: true,
  });
};
