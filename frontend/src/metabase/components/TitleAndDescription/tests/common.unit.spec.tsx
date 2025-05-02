import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: SetupOpts) {
  return baseSetup({ hasEnterprisePlugins: false, ...opts });
}

describe("TitleAndDescription Component", () => {
  it("displays 'Sample text' and 'Sample description' correctly", async () => {
    setup({ localeCode: "de" });
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
