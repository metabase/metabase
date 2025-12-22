import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("useTranslateContent (EE with token, in static embedding)", () => {
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("returns a function that translates the given string", async () => {
    setup({
      msgid: "Hello World",
      localeCode: "es",
      dictionary: [
        { locale: "es", msgid: "Hello World", msgstr: "Hola Mundo" },
      ],
      enterprisePlugins: ["content_translation"],
      tokenFeatures: { content_translation: true },
      staticallyEmbedded: true,
    });
    expect(await screen.findByText("Hola Mundo")).toBeInTheDocument();
    expect(getContentTranslatorSpy()).toHaveBeenCalled();
  });
});
