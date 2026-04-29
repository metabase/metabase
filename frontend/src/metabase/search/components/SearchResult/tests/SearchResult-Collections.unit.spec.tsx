import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import {
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { getIcon, queryIcon, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { SearchResult } from "metabase/search/components/SearchResult";
import type { WrappedResult } from "metabase/search/types";
import type { TokenFeatures } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

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
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
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

  reinitialize();

  const { render } = createScenario()
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<SearchResult result={result} index={0} />);
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
