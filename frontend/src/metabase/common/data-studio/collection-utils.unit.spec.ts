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

  it("should only allow dashboards and collections in Library Dashboards collections", () => {
    expect(canPlaceEntityInCollection("dashboard", "library-dashboards")).toBe(
      true,
    );
    expect(canPlaceEntityInCollection("collection", "library-dashboards")).toBe(
      true,
    );
    expect(canPlaceEntityInCollection("card", "library-dashboards")).toBe(
      false,
    );
    expect(canPlaceEntityInCollection("metric", "library-dashboards")).toBe(
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

  it("should let questions reach the dashboards inside the Library", () => {
    expect(canPlaceEntityInCollectionOrDescendants("card", "library")).toBe(
      true,
    );
    expect(
      canPlaceEntityInCollectionOrDescendants("card", "library-dashboards"),
    ).toBe(true);
    expect(
      canPlaceEntityInCollectionOrDescendants("card", "library-data"),
    ).toBe(false);
  });

  it("should let dashboards reach the Library's Dashboards collection", () => {
    expect(
      canPlaceEntityInCollectionOrDescendants("dashboard", "library"),
    ).toBe(true);
    expect(
      canPlaceEntityInCollectionOrDescendants("dashboard", "library-metrics"),
    ).toBe(false);
  });
});
