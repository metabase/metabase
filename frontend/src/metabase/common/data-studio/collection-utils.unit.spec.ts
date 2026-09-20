import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { canPlaceEntityInCollection } from "./collection-utils";

describe("canPlaceEntityInCollection", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupEnterpriseOnlyPlugin("library");
  });

  it("should only allow folders in the seeded Library root", () => {
    const libraryRoot = { type: "library", is_library_root: true } as const;
    expect(canPlaceEntityInCollection("table", libraryRoot)).toBe(false);
    expect(canPlaceEntityInCollection("metric", libraryRoot)).toBe(false);
    expect(canPlaceEntityInCollection("collection", libraryRoot)).toBe(true);
  });

  it("should allow tables, metrics and folders in a user-created Library folder", () => {
    const userFolder = { type: "library" } as const;
    expect(canPlaceEntityInCollection("table", userFolder)).toBe(true);
    expect(canPlaceEntityInCollection("metric", userFolder)).toBe(true);
    expect(canPlaceEntityInCollection("collection", userFolder)).toBe(true);
    expect(canPlaceEntityInCollection("dashboard", userFolder)).toBe(false);
  });

  it("should only allow tables and collections in Library Data collections", () => {
    const dataCollection = { type: "library-data" } as const;
    expect(canPlaceEntityInCollection("table", dataCollection)).toBe(true);
    expect(canPlaceEntityInCollection("collection", dataCollection)).toBe(true);
    expect(canPlaceEntityInCollection("metric", dataCollection)).toBe(false);
  });

  it("should only allow metrics and collections in Library Metrics collections", () => {
    const metricsCollection = { type: "library-metrics" } as const;
    expect(canPlaceEntityInCollection("metric", metricsCollection)).toBe(true);
    expect(canPlaceEntityInCollection("collection", metricsCollection)).toBe(
      true,
    );
    expect(canPlaceEntityInCollection("table", metricsCollection)).toBe(false);
  });

  it("should allow entities in non-Library collections", () => {
    expect(canPlaceEntityInCollection("table", { type: null })).toBe(true);
    expect(canPlaceEntityInCollection("metric", {})).toBe(true);
    expect(canPlaceEntityInCollection("collection", { type: null })).toBe(true);
  });
});
