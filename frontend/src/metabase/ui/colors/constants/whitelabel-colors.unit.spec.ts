import { mapWhitelabelColorsToTokens } from "./whitelabel-colors";

describe("mapWhitelabelColorsToTokens", () => {
  it("translates whitelabel setting keys to their tokens", () => {
    expect(
      mapWhitelabelColorsToTokens({
        brand: "#ff0000",
        filter: "#00ff00",
        summarize: "#0000ff",
        accent0: "#111111",
      }),
    ).toEqual({
      "core-brand": "#ff0000",
      "core-filter": "#00ff00",
      "core-summarize": "#0000ff",
      accent0: "#111111",
    });
  });
});
