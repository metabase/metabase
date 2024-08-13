import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/test-utils";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {
  filterOutItemsFromInstanceAnalytics,
  getCollectionType,
  getIcon,
  isRegularCollection,
} from "./utils";

describe("Collections plugin utils", () => {
  const COLLECTION = {
    NO_AUTHORITY_LEVEL: createMockCollection({
      id: "root",
      name: "Our analytics",
    }),
    REGULAR: createMockCollection({ authority_level: null }),
    OFFICIAL: createMockCollection({ authority_level: "official" }),
  };

  describe("isRegularCollection", () => {
    it("returns 'true' if collection is missing an authority level", () => {
      const collection = COLLECTION.NO_AUTHORITY_LEVEL;
      expect(isRegularCollection(collection)).toBe(true);
    });

    it("returns 'true' for regular collections", () => {
      const collection = COLLECTION.REGULAR;
      expect(isRegularCollection(collection)).toBe(true);
    });

    it("returns 'false' for official collections", () => {
      const collection = COLLECTION.OFFICIAL;
      expect(isRegularCollection(collection)).toBe(false);
    });
  });

  describe("getCollectionType", () => {
    it("regular collection", () => {
      const collection = createMockCollection();
      expect(getCollectionType(collection).icon).toBe("folder");
    });

    it("official collection", () => {
      const collection = createMockCollection({ authority_level: "official" });
      expect(getCollectionType(collection).icon).toBe("badge");
    });

    it("instance analytics collection", () => {
      const collection = createMockCollection({ type: "instance-analytics" });
      expect(getCollectionType(collection).icon).toBe("audit");
    });

    it("root collection", () => {
      const collection = createMockCollection();
      expect(getCollectionType(collection).type).toBe(null);
      expect(getCollectionType({}).type).toBe(null);
    });
  });

  describe("getIcon", () => {
    it("should return the default icon for a regular collection", () => {
      expect(getIcon({ model: "collection" })).toEqual({ name: "folder" });
    });
    it("should return the default icon for a regular dashboard", () => {
      expect(getIcon({ model: "dashboard" })).toEqual({ name: "dashboard" });
    });
    it("should return the default icon for a regular question", () => {
      expect(getIcon({ model: "card" })).toEqual({ name: "table" });
    });

    describe("enterprise icons", () => {
      it("should return the correct icon for an instance analytics collection", () => {
        expect(
          getIcon({ model: "collection", type: "instance-analytics" }),
        ).toEqual({ name: "audit" });
      });

      it("should return the correct icon for an official collection", () => {
        expect(
          getIcon({ model: "collection", authority_level: "official" }),
        ).toEqual({ name: "badge", color: "saturated-yellow" });
      });

      it("official collection in search", () => {
        const collection = {
          id: 101,
          collection_authority_level: "official",
          model: "collection" as const,
        };
        expect(getIcon(collection).name).toBe("badge");
      });

      it("should return the correct icon for an official model", () => {
        expect(
          getIcon({ model: "dataset", moderated_status: "verified" }),
        ).toEqual({ name: "model_with_badge" });
      });
    });
  });

  describe("filterOutItemsFromInstanceAnalytics", () => {
    const state = createMockState({
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          audit_app: true,
        }),
      }),
    });
    beforeEach(() => {
      setupEnterprisePlugins();
    });

    it("should filter out items directly in an instance analytics collection", () => {
      renderWithProviders(<></>, {
        storeInitialState: state,
      });
      // Ids must be distinct because we cache based on id
      const items = [
        createMockModelResult({
          id: 0,
          name: "filter this out",
          collection: createMockCollection({
            id: 1,
            type: "instance-analytics",
          }),
        }),
        createMockModelResult({
          id: 2,
          name: "filter this out",
          collection: createMockCollection({
            id: 3,
            effective_ancestors: [
              createMockCollection({
                id: 4,
                type: "instance-analytics",
              }),
            ],
          }),
        }),
        createMockModelResult({
          id: 5,
          name: "filter this out",
          collection: createMockCollection({
            id: 6,
            effective_ancestors: [
              createMockCollection({ id: 7 }),
              createMockCollection({ id: 8, type: "instance-analytics" }),
            ],
          }),
        }),
        createMockModelResult({
          id: 9,
          name: "keep this",
          collection: createMockCollection({ id: 10 }),
        }),
      ];

      const result = filterOutItemsFromInstanceAnalytics(items);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("keep this");
    });

    it("should handle empty input array", () => {
      renderWithProviders(<></>, {
        storeInitialState: state,
      });
      const result = filterOutItemsFromInstanceAnalytics([]);
      expect(result).toEqual([]);
    });
  });
});
