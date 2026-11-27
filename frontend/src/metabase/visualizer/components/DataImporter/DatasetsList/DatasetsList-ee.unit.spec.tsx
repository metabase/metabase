import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { RecentItem, SearchResult } from "metabase-types/api";
import {
  createMockRecentCollectionItem,
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DatasetsList } from "./DatasetsList";

type SetupOpts = {
  search: string;
  searchResults?: SearchResult[];
  recentItems?: RecentItem[];
};

const setup = ({ search, searchResults = [], recentItems = [] }: SetupOpts) => {
  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("content_verification");
  setupEnterpriseOnlyPlugin("moderation");
  setupSearchEndpoints(searchResults);
  setupRecentViewsEndpoints(recentItems);

  renderWithProviders(
    <DatasetsList
      search={search}
      setDataSourceCollapsed={jest.fn()}
      dashboardId={undefined}
    />,
    { storeInitialState },
  );
};

async function findDatasetButton(name: string) {
  const datasetsList = await screen.findByTestId("datasets-list");
  await within(datasetsList).findByText(name);
  const buttons = within(datasetsList).getAllByTestId("swap-dataset-button");
  return checkNotNull(buttons.find((button) => button.textContent === name));
}

describe("DatasetsList (EE)", () => {
  it("marks verified search results", async () => {
    setup({
      search: "Orders",
      searchResults: [
        createMockSearchResult({
          id: 1,
          name: "Verified Orders",
          model: "card",
          moderated_status: "verified",
        }),
        createMockSearchResult({
          id: 2,
          name: "Other Orders",
          model: "card",
          moderated_status: null,
        }),
      ],
    });

    const verifiedButton = await findDatasetButton("Verified Orders");
    const otherButton = await findDatasetButton("Other Orders");

    expect(
      within(verifiedButton).getByLabelText("verified_filled icon"),
    ).toBeInTheDocument();
    expect(
      within(otherButton).queryByLabelText("verified_filled icon"),
    ).not.toBeInTheDocument();
  });

  it("marks verified recent items", async () => {
    setup({
      search: "",
      recentItems: [
        createMockRecentCollectionItem({
          id: 1,
          name: "Verified Orders",
          model: "card",
          moderated_status: "verified",
        }),
      ],
    });

    const verifiedButton = await findDatasetButton("Verified Orders");

    expect(
      within(verifiedButton).getByLabelText("verified_filled icon"),
    ).toBeInTheDocument();
  });
});
