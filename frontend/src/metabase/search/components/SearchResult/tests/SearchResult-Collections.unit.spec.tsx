import { waitFor } from "@testing-library/react";

import { setupEnterpriseTest } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { SearchResult } from "metabase/search/components/SearchResult";
import type { WrappedResult } from "metabase/search/types";
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

const setup = ({ result }: { result: WrappedResult }) => {
  setupCollectionByIdEndpoint({
    collections: [TEST_REGULAR_COLLECTION, TEST_OFFICIAL_COLLECTION],
  });

  setupUserRecipientsEndpoint({ users: [createMockUser()] });

  renderWithProviders(<SearchResult result={result} index={0} />);
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
      expect(queryIcon("verified_collection")).not.toBeInTheDocument();
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
      expect(queryIcon("verified_collection")).not.toBeInTheDocument();
    });
  });

  describe("EE", () => {
    const resultInOfficalCollectionEE: WrappedResult = {
      ...resultInOfficalCollection,
      getIcon: () => ({ name: "table" }),
    };

    beforeAll(() => {
      setupEnterpriseTest();
    });

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
      expect(queryIcon("verified_collection")).not.toBeInTheDocument();
    });

    it("renders official collections correctly", async () => {
      setup({ result: resultInOfficalCollectionEE });
      expect(
        screen.getByText(resultInOfficalCollectionEE.name),
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.queryByTestId("info-text-collection-loading-text"),
        ).not.toBeInTheDocument();
      });

      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(getIcon("verified_collection")).toBeInTheDocument();
      expect(queryIcon("folder")).not.toBeInTheDocument();
    });
  });
});
