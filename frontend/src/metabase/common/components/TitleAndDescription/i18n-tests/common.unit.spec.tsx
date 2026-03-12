import userEvent from "@testing-library/user-event";

import { setupTranslateContentStringSpy } from "__support__/content-translation";
import { screen } from "__support__/ui";

import { setup } from "./utils.spec";

describe("TitleAndDescription component (OSS)", () => {
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("displays untranslated question title and description", async () => {
    setup();
    expect(
      await screen.findByRole("heading", {
        name: "Sample Heading",
      }),
    ).toBeInTheDocument();

    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: "Sample Description",
      }),
    ).toBeInTheDocument();

    expect(getContentTranslatorSpy()).not.toHaveBeenCalled();
  });
});
