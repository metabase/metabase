import fetchMock from "fetch-mock";

import { act, screen } from "__support__/ui";
import type { SetupOpts } from "metabase/admin/performance/components/test-utils";
import {
  changeInput,
  getSaveButton,
  setupStrategyEditorForDatabases as baseSetup,
} from "metabase/admin/performance/components/test-utils";
import { PLUGIN_CACHING } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

function setup(opts: SetupOpts = {}) {
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: createMockTokenFeatures({ cache_granular_controls: true }),
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
  it("lets user override root strategy on enterprise instance", async () => {
    expect(PLUGIN_CACHING.canOverrideRootStrategy).toBe(true);
  });
  it("should show strategy form launchers", async () => {
    const rootStrategyHeading = await screen.findByText("Default policy");
    expect(rootStrategyHeading).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Edit default policy (currently: Duration)"),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByLabelText(/Edit policy for database/),
    ).toHaveLength(4);
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 1' (currently: Adaptive)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 2' (currently: No caching)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 3' (currently: Duration)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 4' (currently inheriting the default policy, Duration)",
      ),
    ).toBeInTheDocument();
  });

  it("lets user change the default policy from 'Duration' to 'Adaptive' to 'Don't cache results'", async () => {
    const editButton = await screen.findByLabelText(
      `Edit default policy (currently: Duration)`,
    );
    editButton.click();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      const durationStrategyRadioButton = await screen.findByRole("radio", {
        name: /keep the cache for a number of hours/i,
      });
      expect(durationStrategyRadioButton).toBeChecked();

      expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

      await changeInput(/Cache results for this many hours/, 24, 48);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(`Edit default policy (currently: Duration)`),
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
      const adaptiveStrategyRadioButton = await screen.findByRole("radio", {
        name: /Adaptive/i,
      });
      adaptiveStrategyRadioButton.click();
    });

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(`Edit default policy (currently: Adaptive)`),
    ).toBeInTheDocument();
  });

  it("lets user change policy for Database 1 from 'Adaptive' to 'Duration' to 'Don't cache to 'Use default'", async () => {
    const editButton = await screen.findByLabelText(
      `Edit policy for database 'Database 1' (currently: Adaptive)`,
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
        name: /keep the cache for a number of hours/i,
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
      "Edit policy for database 'Database 1' (currently: Duration)",
    );

    // Switch to Adaptive strategy
    const multiplierStrategyRadioButton = await screen.findByRole("radio", {
      name: /Adaptive/i,
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
        `Edit policy for database 'Database 1' (currently: Adaptive)`,
      ),
    ).toBeInTheDocument();
  });
});
