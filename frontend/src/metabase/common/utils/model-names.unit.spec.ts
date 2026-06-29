import { getTranslatedEntityName } from "./model-names";

describe("common/utils/model-names", () => {
  it("returns the correct colloquial name for the underlying model", () => {
    expect(getTranslatedEntityName("dashboard")).toBe("Dashboard");
    expect(getTranslatedEntityName("card")).toBe("Question");
    expect(getTranslatedEntityName("dataset")).toBe("Model");
    expect(getTranslatedEntityName("indexed-entity")).toBe("Indexed record");
  });

  // TEMP ci-conductor FE smoke test — revert before merge.
  it("TEMP ci-conductor fe reporting smoke", () => {
    expect(getTranslatedEntityName("dashboard")).toBe("NOPE");
  });
});
