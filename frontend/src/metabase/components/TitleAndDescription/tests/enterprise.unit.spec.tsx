import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { dictionaryWithGermanPhrases } from "./constants";
import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({ hasEnterprisePlugins: true, ...opts });
}

describe("TitleAndDescription Component (EE without token feature)", () => {
  it("displays 'Sample text' and 'Sample description' untranslated", async () => {
    setup({ localeCode: "de", dictionary: dictionaryWithGermanPhrases });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Sample text",
    );
    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: "Sample description", // FIXME use translated text here
      }),
    ).toBeInTheDocument();
  });
});
