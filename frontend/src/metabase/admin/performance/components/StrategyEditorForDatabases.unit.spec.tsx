import { act, screen } from "__support__/ui";

import { changeInput, getSaveButton, setup } from "./test-utils";

describe("StrategyEditorForDatabases", () => {
  it("lets user change the default policy from 'Duration' to 'Query duration multiplier' to 'No caching'", async () => {
    setup();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    const ttlStrategyRadioButton = await screen.findByRole("radio", {
      name: /Query duration multiplier/i,
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
      const durationStrategyRadioButton = await screen.findByRole("radio", {
        name: /hours/i,
      });
      durationStrategyRadioButton.click();
      expect((await screen.findAllByRole("spinbutton")).length).toBe(1);
      await changeInput(/Cache results for this many hours/, 24, 48);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

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
