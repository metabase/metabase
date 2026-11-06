import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import {
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
} from "./collection-utils";

describe("canPlaceEntityInCollection", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupEnterpriseOnlyPlugin("library");
  });

  it("should reject every entity type for the root Library collection", () => {
    expect(canPlaceEntityInCollection("table", "library")).toBe(false);
    expect(canPlaceEntityInCollection("metric", "library")).toBe(false);
    expect(canPlaceEntityInCollection("collection", "library")).toBe(false);
  });

  it("should only allow tables and collections in Library Data collections", () => {
    expect(canPlaceEntityInCollection("table", "library-data")).toBe(true);
    expect(canPlaceEntityInCollection("collection", "library-data")).toBe(true);
    expect(canPlaceEntityInCollection("metric", "library-data")).toBe(false);
  });

  it("should only allow metrics and collections in Library Metrics collections", () => {
    expect(canPlaceEntityInCollection("metric", "library-metrics")).toBe(true);
    expect(canPlaceEntityInCollection("collection", "library-metrics")).toBe(
      true,
    );
    expect(canPlaceEntityInCollection("table", "library-metrics")).toBe(false);
  });

  it("should allow everything but tables in Library Dashboards collections", () => {
    for (const entityType of [
      "dashboard",
      "card",
      "dataset",
      "metric",
      "collection",
    ] as const) {
      expect(canPlaceEntityInCollection(entityType, "library-dashboards")).toBe(
        true,
      );
    }
    expect(canPlaceEntityInCollection("table", "library-dashboards")).toBe(
      false,
    );
  });

  it("should allow entities in non-Library collections", () => {
    expect(canPlaceEntityInCollection("table", null)).toBe(true);
    expect(canPlaceEntityInCollection("metric", undefined)).toBe(true);
    expect(canPlaceEntityInCollection("collection", null)).toBe(true);
  });
});

describe("canPlaceEntityInCollectionOrDescendants", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    setupEnterpriseOnlyPlugin("library");
  });

  it("should let cards and dashboards reach Library through its Dashboards collection", () => {
    expect(canPlaceEntityInCollectionOrDescendants("card", "library")).toBe(
      true,
    );
    expect(
      canPlaceEntityInCollectionOrDescendants("dashboard", "library"),
    ).toBe(true);
  });

  it("should keep Library Data and Metrics descendants to their own types", () => {
    expect(
      canPlaceEntityInCollectionOrDescendants("card", "library-data"),
    ).toBe(false);
    expect(
      canPlaceEntityInCollectionOrDescendants("dashboard", "library-metrics"),
    ).toBe(false);
  });
});
