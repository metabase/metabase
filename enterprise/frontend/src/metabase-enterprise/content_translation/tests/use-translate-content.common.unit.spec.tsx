import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("useTranslateContent (OSS)", () => {
  const getTranslateContentStringSpy = setupTranslateContentStringSpy();

  it("does not invoke the translateContentString function", async () => {
    setup({
      msgid: "Hello World",
      localeCode: "es",
      dictionary: [
        { locale: "es", msgid: "Hello World", msgstr: "Hola Mundo" },
      ],
      enterprisePlugins: ["content_translation"],
      tokenFeatures: { content_translation: false },
      staticallyEmbedded: false,
    });
    expect(await screen.findByText("Hello World")).toBeInTheDocument();
    expect(getTranslateContentStringSpy()).not.toHaveBeenCalled();
  });
});
