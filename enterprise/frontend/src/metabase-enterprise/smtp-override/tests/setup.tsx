import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { SMTPConnectionCard } from "metabase/admin/settings/components/Email/SMTPConnectionCard";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
  isHosted?: boolean;
  smtpOverrideEnabled?: boolean;
  smtpOverrideConfigured?: boolean;
}

export function setup({
  tokenFeatures = {},
  hasEnterprisePlugins = false,
  isHosted = true,
  smtpOverrideEnabled = false,
  smtpOverrideConfigured = false,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
    "is-hosted?": isHosted,
    "smtp-override-enabled": smtpOverrideEnabled,
    "email-smtp-host-override": smtpOverrideConfigured
      ? "smtp.example.com"
      : null,
    "email-smtp-port-override": smtpOverrideConfigured ? 587 : null,
    "email-smtp-security-override": smtpOverrideConfigured ? "tls" : null,
    "email-smtp-username-override": smtpOverrideConfigured
      ? "test@example.com"
      : null,
    "email-smtp-password-override": smtpOverrideConfigured ? "password" : null,
    "email-from-address-override": smtpOverrideConfigured
      ? "noreply@example.com"
      : null,
  });

  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const renderResult = renderWithProviders(<SMTPConnectionCard />, {
    storeInitialState: state,
  });

  return {
    ...renderResult,
    getState: renderResult.store.getState,
  };
}
