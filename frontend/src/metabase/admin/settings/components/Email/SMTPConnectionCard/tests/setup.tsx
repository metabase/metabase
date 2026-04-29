import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { SMTPConnectionCard } from "metabase/admin/settings/components/Email/SMTPConnectionCard/SMTPConnectionCard";
import type { SettingKey, TokenFeatures } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
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

  const { render } = createScenario()
    .withSettings({
      "is-hosted?": isHosted,
      "smtp-override-enabled": smtpOverrideEnabled,
    })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<SMTPConnectionCard />);
}
