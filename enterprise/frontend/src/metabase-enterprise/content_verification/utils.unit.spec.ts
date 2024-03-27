import type { CollectionEssentials, SearchResult } from "metabase-types/api";
import { createMockModelResult } from "metabase-types/api/mocks";

import { availableModelFilters, sortCollectionsByVerification } from "./utils";

describe("Utilities related to content verification", () => {
  it("include a function that sorts verified collections before unverified collections", () => {
    const unsorted: CollectionEssentials[] = [
      {
        id: 99,
        authority_level: "official",
        name: "Collection Zulu - verified",
      },
      {
        id: 1,
        authority_level: null,
        name: "Collection Alpha - unverified",
      },
    ];
    const sortFunction = (a: CollectionEssentials, b: CollectionEssentials) =>
      sortCollectionsByVerification(a, b) || a.name.localeCompare(b.name);
    const sorted = unsorted.sort(sortFunction);
    expect(sorted[0].name).toBe("Collection Zulu - verified");
    expect(sorted[1].name).toBe("Collection Alpha - unverified");
  });
  it("include a constant that defines a filter for only showing verified models", () => {
    const models: SearchResult[] = [
      createMockModelResult({
        name: "A verified model",
        moderated_status: "verified",
      }),
      createMockModelResult({
        name: "An unverified model",
        moderated_status: null,
      }),
    ];
    const filteredModels = models.filter(
      availableModelFilters.onlyShowVerifiedModels.predicate,
    );
    expect(filteredModels.length).toBe(1);
    expect(filteredModels[0].name).toBe("A verified model");
  });
});
