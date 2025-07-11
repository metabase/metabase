import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { SMTPConnectionCard } from "metabase/admin/settings/components/Email/SMTPConnectionCard/SMTPConnectionCard";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
  isHosted?: boolean;
  smtpOverrideEnabled?: boolean;
}

export function setup({
  tokenFeatures = {},
  hasEnterprisePlugins = false,
  isHosted = true,
  smtpOverrideEnabled = false,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
    "is-hosted?": isHosted,
    "smtp-override-enabled": smtpOverrideEnabled,
  });

  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<SMTPConnectionCard />, {
    storeInitialState: state,
  });
}
