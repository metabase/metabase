import { sampleDictionary } from "./constants";
import {
  type SetupOpts,
  assertStringsArePresent,
  assertStringsDoNotBecomePresent,
  setup as baseSetup,
} from "./utils";

describe("TitleAndDescription component (OSS)", () => {
  const setup = (opts: SetupOpts) =>
    baseSetup({ hasEnterprisePlugins: false, ...opts });

  describe("when a German content translation dictionary is provided", () => {
    it("displays untranslated question title and description when locale is English", async () => {
      setup({ localeCode: "en", dictionary: sampleDictionary });
      assertStringsArePresent("msgid");
      await assertStringsDoNotBecomePresent("msgstr");
    });

    it("displays untranslated question title and description when locale is German", async () => {
      setup({ localeCode: "de", dictionary: sampleDictionary });
      assertStringsArePresent("msgid");
      await assertStringsDoNotBecomePresent("msgstr");
    });
  });
});
