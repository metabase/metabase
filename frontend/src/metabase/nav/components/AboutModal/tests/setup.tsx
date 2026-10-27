import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupLogoEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockVersion,
} from "metabase-types/api/mocks";

import { AboutModal } from "../AboutModal";

export interface SetupOpts {
  applicationName?: string;
  hasWhitelabel?: boolean;
}

export const setup = ({
  applicationName,
  hasWhitelabel = false,
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ whitelabel: hasWhitelabel }),
      "application-name": applicationName,
      version: createMockVersion({ tag: "v1.2.3" }),
    }),
  });

  if (hasWhitelabel) {
    setupEnterpriseOnlyPlugin("whitelabel");
  }
  setupLogoEndpoint();

  renderWithProviders(<AboutModal opened onClose={jest.fn()} />, {
    storeInitialState: state,
  });
};
