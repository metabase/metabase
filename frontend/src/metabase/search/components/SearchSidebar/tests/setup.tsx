import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { SearchSidebar } from "metabase/search/components/SearchSidebar";
import type { URLSearchFilterQueryParams } from "metabase/search/types";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface SearchSidebarSetupOptions {
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
  value?: URLSearchFilterQueryParams;
  onChange?: (filters: URLSearchFilterQueryParams) => void;
}

const TEST_DATABASE = createMockDatabase();

export const setup = ({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
  value = {},
  onChange = jest.fn(),
}: SearchSidebarSetupOptions = {}) => {
  setupDatabasesEndpoints([TEST_DATABASE]);

  const settings = mockSettings({ "token-features": tokenFeatures });

  const state = createMockState({
    settings,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<SearchSidebar value={value} onChange={onChange} />, {
    storeInitialState: state,
  });
};
