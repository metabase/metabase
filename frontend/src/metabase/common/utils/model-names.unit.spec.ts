import { getTranslatedEntityName } from "./model-names";

describe("common/utils/model-names", () => {
  it("returns the correct colloquial name for the underlying model", () => {
    expect(getTranslatedEntityName("dashboard")).toBe("Dashboard");
    expect(getTranslatedEntityName("card")).toBe("Question");
    expect(getTranslatedEntityName("dataset")).toBe("Model");
    expect(getTranslatedEntityName("indexed-entity")).toBe("Indexed record");
  });
});
