import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

describe("getTranslatedFilterDisplayName (OSS)", () => {
  const noopTc: ContentTranslationFunction = (str) => str;

  it("should return displayName unchanged", () => {
    const result = PLUGIN_CONTENT_TRANSLATION.getTranslatedFilterDisplayName(
      "Total is greater than 100",
      noopTc,
      "Total",
    );

    expect(result).toBe("Total is greater than 100");
  });

  it("should return displayName unchanged when columnDisplayName is undefined", () => {
    const result = PLUGIN_CONTENT_TRANSLATION.getTranslatedFilterDisplayName(
      "Some filter",
      noopTc,
      undefined,
    );

    expect(result).toBe("Some filter");
  });

  it("should return empty string when displayName is empty", () => {
    const result = PLUGIN_CONTENT_TRANSLATION.getTranslatedFilterDisplayName(
      "",
      noopTc,
      undefined,
    );

    expect(result).toBe("");
  });
});
