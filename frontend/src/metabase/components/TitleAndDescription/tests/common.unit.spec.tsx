import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { dictionaryWithGermanPhrases as dictionary } from "./constants";
import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({ hasEnterprisePlugins: false, ...opts });
}

describe("TitleAndDescription Component (OSS)", () => {
  it("displays untranslated question title and description when locale is English", async () => {
    setup({ localeCode: "en", dictionary });

    expect(await screen.findByRole("heading", { level: 2 })).toHaveTextContent(
      dictionary[0].msgid,
    );

    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: dictionary[1].msgid,
      }),
    ).toBeInTheDocument();
  });

  it("displays untranslated question title and description when locale is German", async () => {
    setup({ localeCode: "de", dictionary });

    expect(await screen.findByRole("heading", { level: 2 })).toHaveTextContent(
      dictionary[0].msgid,
    );

    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: dictionary[1].msgid,
      }),
    ).toBeInTheDocument();
  });
});
