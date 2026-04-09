import type { ReactElement } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import type { DictionaryArray, TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface ContentTranslationTestSetupOptions {
  localeCode?: string;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
  dictionary?: DictionaryArray;
  staticallyEmbedded?: boolean;
}

export const setupForContentTranslationTest = ({
  localeCode = "en",
  enterprisePlugins,
  tokenFeatures = {},
  dictionary,
  staticallyEmbedded,
  component,
}: ContentTranslationTestSetupOptions & { component: ReactElement }) => {
  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ locale: localeCode }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  setupContentTranslationEndpoints({ dictionary });

  if (staticallyEmbedded) {
    PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding("mock-jwt-token");
  }

  return renderWithProviders(component, { storeInitialState });
};
