import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { SMTPConnectionCard } from "metabase/admin/settings/components/Email/SMTPConnectionCard/SMTPConnectionCard";
import type { SettingKey, TokenFeatures } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  isHosted?: boolean;
  smtpOverrideEnabled?: boolean;
}

export function setup({
  tokenFeatures = {},
  enterprisePlugins,
  isHosted = true,
  smtpOverrideEnabled = false,
}: SetupOpts = {}) {
  const settings = {
    "token-features": createMockTokenFeatures(tokenFeatures),
    "is-hosted?": isHosted,
    "smtp-override-enabled": smtpOverrideEnabled,
  };

  setupPropertiesEndpoints(createMockSettings(settings));
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  const state = createMockState({ settings: mockSettings(settings) });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(<SMTPConnectionCard />, {
    storeInitialState: state,
  });
}
