import { act, screen } from "__support__/ui";

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
    ttlStrategyRadioButton.click();

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    // NOTE: There is no need to check that the submission of the form was successful.
    // It doesn't meaningfully change the state of the component on OSS

    await act(async () => {
      const noCacheStrategyRadioButton = await screen.findByRole("radio", {
        name: /Don.t cache/i,
      });
      noCacheStrategyRadioButton.click();
    });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    (await screen.findByTestId("strategy-form-submit-button")).click();
  });
});
