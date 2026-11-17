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
  within,
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

const officialCardResult = createWrappedSearchResult({
  id: 11,
  name: "Official Question",
  model: "card",
  collection: TEST_OFFICIAL_COLLECTION,
});

const officialDashboardResult = createWrappedSearchResult({
  id: 12,
  name: "Official Dashboard",
  model: "dashboard",
  collection: TEST_OFFICIAL_COLLECTION,
});

const regularCardResult = createWrappedSearchResult({
  id: 13,
  name: "Regular Question",
  model: "card",
  collection: TEST_REGULAR_COLLECTION,
});

const getSearchResultItem = async (name: string) => {
  const item = (await screen.findByText(name)).closest(
    "[data-testid=search-result-item]",
  );
  if (!(item instanceof HTMLElement)) {
    throw new Error(`No search result item for ${name}`);
  }
  return item;
};

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

    it.each([officialCardResult, officialDashboardResult])(
      "renders the official badge for the $model in an official collection",
      async (result) => {
        setup({
          result,
          enterprisePlugins: ["collections", "advanced_permissions"],
          tokenFeatures: { official_collections: true },
        });

        const item = await getSearchResultItem(result.name);
        expect(
          within(item).getByText(TEST_OFFICIAL_COLLECTION.name),
        ).toBeInTheDocument();
        expect(
          within(item).getByLabelText("official_collection icon"),
        ).toBeInTheDocument();
      },
    );

    it("does not render the official badge for a question in a regular collection", async () => {
      setup({
        result: regularCardResult,
        enterprisePlugins: ["collections", "advanced_permissions"],
        tokenFeatures: { official_collections: true },
      });

      const item = await getSearchResultItem(regularCardResult.name);
      expect(
        within(item).getByText(TEST_REGULAR_COLLECTION.name),
      ).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });
  });

  describe("EE without the official_collections feature", () => {
    it("renders official collections as regular", async () => {
      setup({
        result: officialCollectionResult,
        enterprisePlugins: ["collections", "advanced_permissions"],
      });

      expect(
        await screen.findByText(officialCollectionResult.name),
      ).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });

    it.each([officialCardResult, officialDashboardResult])(
      "does not render the official badge for the $model in an official collection",
      async (result) => {
        setup({
          result,
          enterprisePlugins: ["collections", "advanced_permissions"],
        });

        const item = await getSearchResultItem(result.name);
        expect(
          within(item).getByText(TEST_OFFICIAL_COLLECTION.name),
        ).toBeInTheDocument();
        expect(queryIcon("official_collection")).not.toBeInTheDocument();
      },
    );
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
