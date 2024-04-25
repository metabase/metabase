import fetchMock from "fetch-mock";

import { act, screen } from "__support__/ui";
import type { SetupOpts } from "metabase/admin/performance/components/test-utils";
import {
  changeInput,
  getSaveButton,
  setup as baseSetup,
} from "metabase/admin/performance/components/test-utils";

function setup(opts: SetupOpts = {}) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { cache_granular_controls: true },
    ...opts,
  });
}

describe("StrategyEditorForDatabases", () => {
  beforeEach(() => {
    setup();
  });
  afterEach(() => {
    fetchMock.restore();
  });
  it("should show strategy form launchers", async () => {
    const rootStrategyHeading = await screen.findByText("Default policy");
    expect(rootStrategyHeading).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Edit default policy (currently: Hours)"),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByLabelText(/Edit policy for database/),
    ).toHaveLength(4);
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 1' (currently: Query duration multiplier)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 2' (currently: No caching)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 3' (currently: Hours)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 4' (currently inheriting the default policy, Hours)",
      ),
    ).toBeInTheDocument();
  });

  it("lets user change the default policy from 'Hours' to Query duration multiplier to No caching", async () => {
    const editButton = await screen.findByLabelText(
      `Edit default policy (currently: Hours)`,
    );
    editButton.click();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      const durationStrategyRadioButton = await screen.findByRole("radio", {
        name: /after a specific number of hours/i,
      });
      // 'Hours' is the default
      expect(durationStrategyRadioButton).toBeChecked();

      expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

      await changeInput(/Cache results for this many hours/, 24, 48);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(`Edit default policy (currently: Hours)`),
    ).toBeInTheDocument();

    await act(async () => {
      const noCacheStrategyRadioButton = await screen.findByRole("radio", {
        name: /Don.t cache/i,
      });
      noCacheStrategyRadioButton.click();

      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

      (await screen.findByTestId("strategy-form-submit-button")).click();
    });

    expect(
      await screen.findByRole("button", { name: /Saved/i }),
    ).toBeInTheDocument();

    expect(await screen.findByLabelText(/Edit default policy/)).toHaveAttribute(
      "aria-label",
      "Edit default policy (currently: No caching)",
    );

    await act(async () => {
      const multiplierStrategyRadioButton = await screen.findByRole("radio", {
        name: /Query duration multiplier/i,
      });
      multiplierStrategyRadioButton.click();
    });

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(
        `Edit default policy (currently: Query duration multiplier)`,
      ),
    ).toBeInTheDocument();
  });

  it("lets user change policy for Database 1 from 'Query duration multiplier' to 'Hours' to 'Don't cache to 'Use default'", async () => {
    const editButton = await screen.findByLabelText(
      `Edit policy for database 'Database 1' (currently: Query duration multiplier)`,
    );
    editButton.click();

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      const noCacheStrategyRadioButton = await screen.findByRole("radio", {
        name: /Don.t cache/i,
      });
      noCacheStrategyRadioButton.click();

      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: No caching)`,
      ),
    ).toBeInTheDocument();

    await act(async () => {
      const durationStrategyRadioButton = await screen.findByRole("radio", {
        name: /specific number of hours/i,
      });
      durationStrategyRadioButton.click();

      expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

      await changeInput(/Cache results for this many hours/, 24, 48);
    });
    (await screen.findByTestId("strategy-form-submit-button")).click();
    expect(
      await screen.findByRole("button", { name: /Saved/i }),
    ).toBeInTheDocument();

    expect(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    ).toHaveAttribute(
      "aria-label",
      "Edit policy for database 'Database 1' (currently: Hours)",
    );

    // Switch to Query duration multiplier strategy
    const multiplierStrategyRadioButton = await screen.findByRole("radio", {
      name: /Query duration multiplier/i,
    });
    multiplierStrategyRadioButton.click();

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: Query duration multiplier)`,
      ),
    ).toBeInTheDocument();
  });
});
