import { renderHook } from "@testing-library/react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  filterOutItemsFromInstanceAnalytics,
  getCollectionType,
  useGetIcon,
} from "./utils";

describe("Collections plugin utils", () => {
  describe("getCollectionType", () => {
    it("regular collection", () => {
      const collection = createMockCollection();
      expect(getCollectionType(collection).icon).toBe("folder");
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

  describe("useGetIcon", () => {
    const createGetIcon = () => {
      const { result } = renderHook(() => useGetIcon());
      return result.current;
    };

    it("should return the default icon for a regular collection", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "collection" })).toEqual({ name: "folder" });
    });

    it("should return the default icon for a regular dashboard", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "dashboard" })).toEqual({
        name: "dashboard",
      });
    });

    it("should return the default icon for a regular question", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card" })).toEqual({ name: "table2" });
    });

    describe("enterprise icons", () => {
      it("should return the correct icon for an instance analytics collection", () => {
        const getIcon = createGetIcon();
        expect(
          getIcon({ model: "collection", type: "instance-analytics" }),
        ).toEqual({ name: "audit" });
      });

      it("returns official icon for remote synced collection", () => {
        const getIcon = createGetIcon();
        expect(
          getIcon({ model: "collection", is_remote_synced: true }),
        ).toEqual({
          name: "official_collection",
          color: "core-yellow-saturated",
          tooltip: "Official collection",
        });
      });

      it("should return the correct icon for a remote synced entity", () => {
        const getIcon = createGetIcon();
        expect(getIcon({ model: "dashboard", is_remote_synced: true })).toEqual(
          { name: "dashboard" },
        );
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
