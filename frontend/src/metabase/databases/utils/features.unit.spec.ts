import { createMockDatabase } from "metabase-types/api/mocks";

import { hasFeature, hasRequiredFeature, supportsJoins } from "./features";

describe("hasFeature", () => {
  it("is true when the database lists the feature", () => {
    expect(
      hasFeature(
        createMockDatabase({ features: ["expressions"] }),
        "expressions",
      ),
    ).toBe(true);
  });

  it("is false when the database has no features", () => {
    expect(
      hasFeature(createMockDatabase({ features: [] }), "expressions"),
    ).toBe(false);
  });
});

describe("supportsJoins", () => {
  it.each(["left-join", "right-join", "inner-join", "full-join"] as const)(
    "treats %s as join support",
    (feature) => {
      expect(supportsJoins(createMockDatabase({ features: [feature] }))).toBe(
        true,
      );
    },
  );

  it("is false when the database supports no join type", () => {
    expect(
      supportsJoins(createMockDatabase({ features: ["expressions"] })),
    ).toBe(false);
  });
});

describe("hasRequiredFeature", () => {
  const database = createMockDatabase({ features: ["expressions"] });

  it("is true when nothing is required", () => {
    expect(hasRequiredFeature(database, null)).toBe(true);
    expect(hasRequiredFeature(database, undefined)).toBe(true);
  });

  it("defers to the feature when one is required", () => {
    expect(hasRequiredFeature(database, "expressions")).toBe(true);
    expect(hasRequiredFeature(database, "nested-queries")).toBe(false);
  });
});
