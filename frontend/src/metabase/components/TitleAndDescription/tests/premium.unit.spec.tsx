import { sampleDictionary } from "./constants";
import {
  type SetupOpts,
  assertStringsArePresent,
  assertStringsDoNotBecomePresent,
  setup as baseSetup,
} from "./utils";

describe("TitleAndDescription component", () => {
  describe("EE with token", () => {
    const setup = (opts: SetupOpts) =>
      baseSetup({
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: true },
        ...opts,
      });

    describe("when a German content translation dictionary is provided", () => {
      it("displays untranslated question title and description when locale is English", async () => {
        setup({ localeCode: "en", dictionary: sampleDictionary });
        assertStringsArePresent("msgid");
        assertStringsDoNotBecomePresent("msgstr");
      });

      it("displays translated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary: sampleDictionary });
        assertStringsArePresent("msgstr");
      });
    });
  });
});
