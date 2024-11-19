import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import {
  changeInput,
  getSaveButton,
  setupStrategyEditorForDatabases as setup,
} from "./test-utils";

describe("StrategyEditorForDatabases", () => {
  beforeEach(() => {
    setup();
  });

  it("lets user change the default policy to 'Adaptive', then 'No caching'", async () => {
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    const ttlStrategyRadioButton = await screen.findByRole("radio", {
      name: /Adaptive/i,
    });

    await userEvent.click(ttlStrategyRadioButton);

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await changeInput(/minimum query duration/i, 1, 5);
    await changeInput(/multiplier/i, 10, 3);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    // NOTE: There is no need to check that the submission of the form was successful.
    // It doesn't meaningfully change the state of the component on OSS

    const noCacheStrategyRadioButton = await screen.findByRole("radio", {
      name: /Don.t cache/i,
    });
    noCacheStrategyRadioButton.click();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    (await screen.findByTestId("strategy-form-submit-button")).click();
  });

  it("does not regard form as dirty when a default value is entered into an input (metabase#42974)", async () => {
    const adaptiveStrategyRadioButton = await screen.findByRole("radio", {
      name: /Adaptive/i,
    });
    await userEvent.click(adaptiveStrategyRadioButton);
    await userEvent.click(await getSaveButton());
    await changeInput(/multiplier/i, 10, 10);
    // The form is not considered dirty, so the save button is not present
    expect(
      screen.queryByTestId("strategy-form-submit-button"),
    ).not.toBeInTheDocument();
  });
});
