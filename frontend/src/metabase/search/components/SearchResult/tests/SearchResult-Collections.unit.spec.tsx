import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { SearchResult } from "metabase/search/components/SearchResult";
import type { WrappedResult } from "metabase/search/types";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { createWrappedSearchResult } from "./util";

const TEST_REGULAR_COLLECTION = createMockCollection({
  id: 1,
  name: "Regular Collection",
  authority_level: null,
});

const TEST_OFFICIAL_COLLECTION = createMockCollection({
  id: 2,
  name: "Official Collection",
  authority_level: "official",
});

const regularCollectionResult = createWrappedSearchResult({
  name: "My Vanilla Collection",
  model: "collection",
  collection: TEST_REGULAR_COLLECTION,
});

const officialCollectionResult = createWrappedSearchResult({
  name: "My Official Collection",
  model: "collection",
  collection_authority_level: "official",
  collection: TEST_REGULAR_COLLECTION,
});

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  result: WrappedResult;
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
        enterprisePlugins: ["collections", "advanced_permissions"],
        tokenFeatures: { official_collections: true },
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
        enterprisePlugins: ["collections", "advanced_permissions"],
        tokenFeatures: { official_collections: true },
      });

      expect(
        await screen.findByText(officialCollectionResult.name),
      ).toBeInTheDocument();

      expect(getIcon("official_collection")).toBeInTheDocument();
      expect(queryIcon("folder")).not.toBeInTheDocument();
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
