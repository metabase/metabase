import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MetricList } from "../MetricList";

export interface SetupOpts {
  user: User;
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  user,
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) => {
  const state = createMockState({
    currentUser: createMockUser(user),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<MetricList />, { storeInitialState: state });
};
