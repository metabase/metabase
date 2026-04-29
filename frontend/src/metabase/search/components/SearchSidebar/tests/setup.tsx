import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import { SearchSidebar } from "metabase/search/components/SearchSidebar";
import type { URLSearchFilterQueryParams } from "metabase/search/types";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

export interface SearchSidebarSetupOptions {
  tokenFeatures?: TokenFeatures;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  value?: URLSearchFilterQueryParams;
  onChange?: (filters: URLSearchFilterQueryParams) => void;
}

const TEST_DATABASE = createMockDatabase();

export const setup = ({
  tokenFeatures = createMockTokenFeatures(),
  enterprisePlugins,
  value = {},
  onChange = jest.fn(),
}: SearchSidebarSetupOptions = {}) => {
  const { render } = createScenario()
    .withDatabase(TEST_DATABASE)
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<SearchSidebar value={value} onChange={onChange} />);
};
