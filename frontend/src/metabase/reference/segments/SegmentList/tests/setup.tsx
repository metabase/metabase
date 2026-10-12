import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupSegmentsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import type { Segment, TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { SegmentList } from "../SegmentList";

export interface SetupOpts {
  user: User;
  segments?: Segment[];
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = async ({
  user,
  segments = [],
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts) => {
  setupSegmentsEndpoints(segments);

  const state = createMockState({
    currentUser: createMockUser(user),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(<SegmentList />, { storeInitialState: state });
  await waitForLoaderToBeRemoved();
};
