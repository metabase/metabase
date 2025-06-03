import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TitleAndDescription from "../TitleAndDescription";

export interface SetupOpts {
  localeCode?: string;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  localeCode,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) => {
  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ locale: localeCode }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  return renderWithProviders(
    <TitleAndDescription
      title={"Sample Heading"}
      description={"Sample Description"}
    />,
    { storeInitialState },
  );
};
