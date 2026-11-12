import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { SearchResult } from "metabase/common/components/SearchResult";
import { reinitialize } from "metabase/plugins";
import type {
  SearchResult as ApiSearchResult,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { createWrappedSearchResult } from "./util";

const TEST_REGULAR_COLLECTION = createMockCollection({
  id: 1,
  name: "Regular Collection",
});

const TEST_OFFICIAL_COLLECTION = createMockCollection({
  id: 2,
  name: "Official Collection",
  is_remote_synced: true,
});

const regularCollectionResult = createWrappedSearchResult({
  name: "My Vanilla Collection",
  model: "collection",
  collection: TEST_REGULAR_COLLECTION,
});

const officialCollectionResult = createWrappedSearchResult({
  name: "My Official Collection",
  model: "collection",
  collection: TEST_OFFICIAL_COLLECTION,
});

const officialCardResult = createWrappedSearchResult({
  name: "My Official Question",
  model: "card",
  collection: TEST_OFFICIAL_COLLECTION,
});

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  result: ApiSearchResult;
}

const setup = ({
  tokenFeatures = {},
  enterprisePlugins,
  result,
}: SetupOpts) => {
  setupCollectionByIdEndpoint({
    collections: [TEST_REGULAR_COLLECTION, TEST_OFFICIAL_COLLECTION],
  });

  setupUserRecipientsEndpoint({ users: [createMockUser()] });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });
  reinitialize();

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(<SearchResult result={result} index={0} />, {
    storeInitialState: state,
  });
};

describe("SearchResult > Collections", () => {
  describe("EE", () => {
    it("renders regular collection correctly", async () => {
      setup({
        result: regularCollectionResult,
        enterprisePlugins: ["collections", "remote_sync"],
        tokenFeatures: { remote_sync: true },
      });
      expect(
        await screen.findByText(regularCollectionResult.name),
      ).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });

    it("renders official collections correctly", async () => {
      setup({
        result: officialCollectionResult,
        enterprisePlugins: ["collections", "remote_sync"],
        tokenFeatures: { remote_sync: true },
      });

      expect(
        await screen.findByText(officialCollectionResult.name),
      ).toBeInTheDocument();

      expect(getIcon("official_collection")).toBeInTheDocument();
      expect(queryIcon("folder")).not.toBeInTheDocument();
    });

    it("renders official badge for card in official collection", async () => {
      setup({
        result: officialCardResult,
        enterprisePlugins: ["collections", "remote_sync"],
        tokenFeatures: { remote_sync: true },
      });

      expect(
        await screen.findByText(officialCardResult.name),
      ).toBeInTheDocument();
      expect(screen.getAllByTestId("official-badge")).toHaveLength(2);
    });
  });

  describe("OSS", () => {
    it("renders regular collection correctly", async () => {
      setup({ result: regularCollectionResult });
      expect(
        await screen.findByText(regularCollectionResult.name),
      ).toBeInTheDocument();

      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });

    it("renders official collections as regular", async () => {
      setup({ result: officialCollectionResult });
      expect(
        await screen.findByText(officialCollectionResult.name),
      ).toBeInTheDocument();

      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });
  });
});
