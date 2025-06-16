import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("ParameterWidget (OSS)", () => {
  describe("content translation", () => {
    const translateContentStringSpy = setupTranslateContentStringSpy();

    it("should not translate any content", async () => {
      setup({
        localeCode: "de",
        dictionary: [
          {
            msgid: "Text contains",
            msgstr: "Text enthält",
            locale: "de",
          },
        ],
      });
      expect(await screen.findByTestId("field-set-legend")).toHaveTextContent(
        "Text contains",
      );
      expect(translateContentStringSpy()).not.toHaveBeenCalled();
    });
  });
});
