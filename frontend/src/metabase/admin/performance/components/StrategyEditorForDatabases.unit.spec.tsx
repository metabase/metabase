import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import {
  changeInput,
  getSaveButton,
  setupStrategyEditorForDatabases as setup,
} from "./test-utils";

// After a successful save the form is no longer dirty, so its submit button
// is removed. Waiting for that keeps the save request's state updates in act.
const waitForSaveToComplete = () =>
  waitFor(() =>
    expect(
      screen.queryByTestId("strategy-form-submit-button"),
    ).not.toBeInTheDocument(),
  );

describe("StrategyEditorForDatabases (OSS)", () => {
  beforeEach(async () => {
    setup();
    // Wait for the cache-config query to render the strategy options, which
    // lets the mount-time queries settle inside act.
    await screen.findAllByRole("radio");
  });

  it("shows two policy options for the default policy: Adaptive and Don't cache", async () => {
    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: /Adaptive/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Don.t cache/i }),
    ).toBeInTheDocument();
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
    await waitForSaveToComplete();

    // NOTE: There is no need to check that the submission of the form was successful.
    // It doesn't meaningfully change the state of the component on OSS

    const noCacheStrategyRadioButton = await screen.findByRole("radio", {
      name: /Don.t cache/i,
    });
    await userEvent.click(noCacheStrategyRadioButton);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );
    await waitForSaveToComplete();
  });

  it("does not regard form as dirty when a default value is entered into an input (metabase#42974)", async () => {
    const adaptiveStrategyRadioButton = await screen.findByRole("radio", {
      name: /Adaptive/i,
    });
    await userEvent.click(adaptiveStrategyRadioButton);
    await userEvent.click(await getSaveButton());
    await waitForSaveToComplete();
    await changeInput(/multiplier/i, 10, 10);
    // The form is not considered dirty, so the save button is not present
    expect(
      screen.queryByTestId("strategy-form-submit-button"),
    ).not.toBeInTheDocument();
  });
});
