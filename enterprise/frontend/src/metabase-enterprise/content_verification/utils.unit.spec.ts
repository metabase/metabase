import { createMockModelResult } from "metabase/browse/test-utils";

import { availableModelFilters } from "./utils";

describe("Utilities related to content verification", () => {
  it("include a constant that defines a filter for only showing verified models", () => {
    const models = [
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
