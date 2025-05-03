import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { content_translation: true },
    ...opts,
  });
}

describe("TitleAndDescription (with mocked useTranslateContent)", () => {
  it("displays translated question title and description", async () => {
    setup({ localeCode: "de" });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Beispieltext",
      );
    });

    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: "Beispielbeschreibung",
      }),
    ).toBeInTheDocument();
  });
});
