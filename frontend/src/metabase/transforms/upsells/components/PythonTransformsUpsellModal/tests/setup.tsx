import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupBillingEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { PythonTransformsUpsellModal } from "../PythonTransformsUpsellModal";

export const setup = ({
  isOpen = true,
  isHosted,
  isStoreUser,
  billingPeriodMonths = 12,
  isEnterprise = false,
}: {
  isOpen?: boolean;
  isHosted: boolean;
  isStoreUser: boolean;
  billingPeriodMonths?: number | undefined;
  isEnterprise?: boolean;
}) => {
  const onClose = jest.fn();

  const storeUserEmail = "store-user@example.com";
  const currentUser = createMockUser(
    isStoreUser ? { email: storeUserEmail } : undefined,
  );

  const settings = {
    "is-hosted?": isHosted,
    "token-status": {
      status: "valid",
      valid: true,
      "store-users": isStoreUser ? [{ email: storeUserEmail }] : [],
      features: [],
    },
    "token-features": createMockTokenFeatures(
      isEnterprise ? { official_collections: true } : {},
    ),
  };

  const state = createMockState({
    settings: mockSettings(settings),
    currentUser,
  });

  if (isEnterprise) {
    const pluginTokens: ENTERPRISE_PLUGIN_NAME[] = ["transforms"];
    pluginTokens.forEach(setupEnterpriseOnlyPlugin);
  }

  setupBillingEndpoints({
    billingPeriodMonths,
    hasBasicTransformsAddOn: true,
    hasAdvancedTransformsAddOn: true,
  });
  setupPropertiesEndpoints(createMockSettings(settings));

  renderWithProviders(
    <PythonTransformsUpsellModal isOpen={isOpen} onClose={onClose} />,
    {
      storeInitialState: state,
    },
  );

  return { onClose };
};
