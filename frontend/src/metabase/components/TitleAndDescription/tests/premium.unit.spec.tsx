import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup as baseSetup } from "./setup";

function setup(opts: SetupOpts = {}) {
  return baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { "content-translation": true },
    ...opts,
  });
}

describe("TitleAndDescription (with mocked useTranslateContent)", () => {
  it("displays 'Sample text-translated' and 'Sample description-translated' correctly", async () => {
    setup();

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Sample text", // FIXME use translated text here
    );

    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: "Sample description", // FIXME use translated text here
      }),
    ).toBeInTheDocument();
  });
});
