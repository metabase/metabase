import { renderWithProviders } from "__support__/ui";
import { SearchSidebar } from "metabase/search/components/SearchSidebar/SearchSidebar";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockState } from "metabase-types/store/mocks";
import { mockSettings } from "__support__/settings";
import type { TokenFeatures } from "metabase-types/api";
import type { URLSearchFilterQueryParams } from "metabase/search/types";

export interface SearchSidebarSetupOptions {
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
  value?: URLSearchFilterQueryParams;
  onChange?: (filters: URLSearchFilterQueryParams) => void;
}

export const setup = ({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
  value = {},
  onChange = jest.fn(),
}: SearchSidebarSetupOptions = {}) => {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const defaultProps = {
    value,
    onChange,
  };

  renderWithProviders(<SearchSidebar {...defaultProps} />, {
    storeInitialState: state,
  });
};
