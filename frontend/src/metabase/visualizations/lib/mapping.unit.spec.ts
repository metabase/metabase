import { getCanonicalRowKey } from "./mapping";

describe("getCanonicalRowKey", () => {
  it("should convert US state names to their iso2 codes", () => {
    expect(getCanonicalRowKey("Alabama", "us_states")).toEqual("al");
    expect(getCanonicalRowKey("california", "us_states")).toEqual("ca");
    expect(getCanonicalRowKey("New york", "us_states")).toEqual("ny");
    expect(getCanonicalRowKey("mAiNe", "us_states")).toEqual("me");
  });

  it("should convert country names to their iso2 codes", () => {
    expect(getCanonicalRowKey("Russia", "world_countries")).toEqual("ru");
    expect(getCanonicalRowKey("Russian Federation", "world_countries")).toEqual(
      "ru",
    );
    expect(
      getCanonicalRowKey("british Indian Ocean territory", "world_countries"),
    ).toEqual("io");
    expect(getCanonicalRowKey("côte d'ivoire", "world_countries")).toEqual(
      "ci",
    );
    expect(getCanonicalRowKey("egypt", "world_countries")).toEqual("eg");
    expect(getCanonicalRowKey("aUsTrIA", "world_countries")).toEqual("at");
  });

  it("should return the input for keys that are not found", () => {
    expect(getCanonicalRowKey("hogwarts", "us_states")).toEqual("hogwarts");
    expect(getCanonicalRowKey("hogwarts", "world_countries")).toEqual(
      "hogwarts",
    );
    expect(getCanonicalRowKey("hogwarts")).toEqual("hogwarts");
  });

  it("should not return codes from the wrong region", () => {
    expect(getCanonicalRowKey("california", "world_countries")).toEqual(
      "california",
    );
    expect(getCanonicalRowKey("russia", "us_states")).toEqual("russia");
    expect(getCanonicalRowKey("russia")).toEqual("russia");
  });
});
