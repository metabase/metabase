import { setupEnterprisePlugins } from "__support__/enterprise";
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
  waitFor,
} from "__support__/ui";
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

const resultInRegularCollection = createWrappedSearchResult({
  name: "My Regular Item",
  collection_authority_level: null,
  collection: TEST_REGULAR_COLLECTION,
});

const resultInOfficalCollection = createWrappedSearchResult({
  name: "My Official Item",
  collection_authority_level: "official",
  collection: TEST_OFFICIAL_COLLECTION,
});

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
  result: WrappedResult;
}

const setup = ({
  tokenFeatures = {},
  hasEnterprisePlugins = false,
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

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<SearchResult result={result} index={0} />, {
    storeInitialState: state,
  });
};

describe("SearchResult > Collections", () => {
  describe("OSS", () => {
    it("renders regular collection correctly", async () => {
      setup({ result: resultInRegularCollection });
      expect(
        screen.getByText(resultInRegularCollection.name),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByTestId("info-text-collection-loading-text"),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText("Regular Collection")).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });

    it("renders official collections as regular", async () => {
      setup({ result: resultInOfficalCollection });
      expect(
        screen.getByText(resultInOfficalCollection.name),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByTestId("info-text-collection-loading-text"),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });
  });

  describe("EE", () => {
    const resultInOfficalCollectionEE: WrappedResult = {
      ...resultInOfficalCollection,
    };

    it("renders regular collection correctly", async () => {
      setup({ result: resultInRegularCollection });
      expect(
        screen.getByText(resultInRegularCollection.name),
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.queryByTestId("info-text-collection-loading-text"),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByText("Regular Collection")).toBeInTheDocument();
      expect(getIcon("folder")).toBeInTheDocument();
      expect(queryIcon("official_collection")).not.toBeInTheDocument();
    });

    it("renders official collections correctly", async () => {
      setup({
        result: resultInOfficalCollectionEE,
        hasEnterprisePlugins: true,
        tokenFeatures: { official_collections: true },
      });
      expect(
        screen.getByText(resultInOfficalCollectionEE.name),
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.queryByTestId("info-text-collection-loading-text"),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(getIcon("official_collection")).toBeInTheDocument();
      expect(queryIcon("folder")).not.toBeInTheDocument();
    });
  });
});
