import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { LegendCaption } from "../LegendCaption";

export interface SetupOpts {
  title: string;
  description?: string;
  locale?: string;
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
}

export function setup({
  title,
  description,
  locale,
  tokenFeatures,
  hasEnterprisePlugins = false,
}: SetupOpts) {
  const storeInitialState = createMockState({
    settings: tokenFeatures
      ? mockSettings({
          "token-features": createMockTokenFeatures(tokenFeatures),
        })
      : undefined,
    currentUser: locale ? createMockUser({ locale }) : undefined,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  return renderWithProviders(
    <LegendCaption title={title} description={description} />,
    {
      storeInitialState,
    },
  );
}
