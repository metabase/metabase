/* istanbul ignore file */
import { useState } from "react";
import {
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { SearchModelType, TokenFeatures } from "metabase-types/api";
import { mockSettings } from "__support__/settings";
import { createMockState } from "metabase-types/store/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { SearchFilterModal } from "metabase/search/components/SearchFilterModal/SearchFilterModal/SearchFilterModal";
import { setupSearchEndpoints } from "__support__/server-mocks";
import { SearchFilters } from "metabase/search/types";

export interface SetupOpts {
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
  initialFilters?: SearchFilters;
  availableModelTypes?: Array<SearchModelType>;
}

export const TEST_TYPES: Array<SearchModelType> = [
  "card",
  "collection",
  "dashboard",
  "database",
  "dataset",
  "metric",
  "pulse",
  "segment",
  "table",
];

export const COMMON_INITIAL_FILTERS: SearchFilters = {
  type: TEST_TYPES,
};

export const PREMIUM_INITIAL_FILTERS: SearchFilters = {
  ...COMMON_INITIAL_FILTERS,
  verified: true,
};

const TestSearchFilterModal = ({
  initialFilters = {},
  onChangeFilters,
}: {
  initialFilters?: SearchFilters;
  onChangeFilters: jest.Mock;
}) => {
  const [filters, setFilters] = useState(initialFilters);

  function handleChangeFilters(newFilters: SearchFilters) {
    setFilters(newFilters);
    onChangeFilters(newFilters);
  }

  return (
    <SearchFilterModal
      isOpen={true}
      setIsOpen={jest.fn()}
      value={filters}
      onChangeFilters={handleChangeFilters}
    />
  );
};

export const setup = async ({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
  initialFilters = {},
  availableModelTypes = TEST_TYPES,
}: SetupOpts = {}) => {
  const onChangeFilters = jest.fn();

  setupSearchEndpoints(
    availableModelTypes.map((type, index) =>
      createMockSearchResult({ model: type, id: index + 1 }),
    ),
  );

  const settings = mockSettings({ "token-features": tokenFeatures });
  const state = createMockState({ settings });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <TestSearchFilterModal
      initialFilters={initialFilters}
      onChangeFilters={onChangeFilters}
    />,
    { storeInitialState: state },
  );

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return {
    onChangeFilters,
  };
};
