import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("useTranslateContent (EE without token)", () => {
  const getTranslateContentStringSpy = setupTranslateContentStringSpy();

  it("returns a function that translates the given string", async () => {
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
