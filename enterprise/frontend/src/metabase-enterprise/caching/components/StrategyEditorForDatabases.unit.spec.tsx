import userEvent from "@testing-library/user-event";

import { act, screen, within } from "__support__/ui";
import type { SetupOpts } from "metabase/admin/performance/components/test-utils";
import {
  setupStrategyEditorForDatabases as baseSetup,
  changeInput,
  getSaveButton,
} from "metabase/admin/performance/components/test-utils";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { PLUGIN_CACHING } from "metabase/plugins";
import {
  CacheDurationUnit,
  type DurationStrategy,
  type ScheduleStrategy,
} from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

function setup(opts: SetupOpts = {}) {
  baseSetup({
    enterprisePlugins: "*", // TODO be more granular about this
    tokenFeatures: createMockTokenFeatures({ cache_granular_controls: true }),
    ...opts,
  });
}

describe("StrategyEditorForDatabases", () => {
  beforeEach(() => {
    setup();
  });

  it("lets user override root strategy on enterprise instance", async () => {
    expect(PLUGIN_CACHING.canOverrideRootStrategy).toBe(true);
  });

  it("shows four policy options for the default policy", async () => {
    await userEvent.click(await screen.findByLabelText(/Edit default policy/));
    expect(await screen.findAllByRole("radio")).toHaveLength(4);
  });

  it("shows five policy options for a database (adds 'Use default')", async () => {
    await userEvent.click(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    );
    expect(await screen.findAllByRole("radio")).toHaveLength(5);
    expect(
      screen.getByRole("radio", { name: /Use default/i }),
    ).toBeInTheDocument();
  });

  it("should show strategy form launchers", async () => {
    const rootStrategyHeading = await screen.findByText("Default policy");
    expect(rootStrategyHeading).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit default policy (currently: Duration: 1h)",
      ),
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
        "Edit policy for database 'Database 3' (currently: Duration: 1h)",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 4' (currently inheriting the default policy, Duration: 1h)",
      ),
    ).toBeInTheDocument();
  });

  it("lets user change the default policy from 'Duration' to 'Adaptive' to 'Don't cache results'", async () => {
    const editButton = await screen.findByLabelText(
      `Edit default policy (currently: Duration: 1h)`,
    );
    await userEvent.click(editButton);
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    const durationStrategyRadioButton = await screen.findByRole("radio", {
      name: /keep the cache for a number of hours/i,
    });
    expect(durationStrategyRadioButton).toBeChecked();

    expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

    await changeInput(/Cache results for this many hours/, 24, 48);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        `Edit default policy (currently: Duration: 48h)`,
      ),
    ).toBeInTheDocument();

    const noCacheStrategyRadioButton = await screen.findByRole("radio", {
      name: /Don.t cache/i,
    });
    await userEvent.click(noCacheStrategyRadioButton);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByTestId("strategy-form-submit-button"),
    ).toHaveTextContent(/Saved/i);

    expect(await screen.findByLabelText(/Edit default policy/)).toHaveAttribute(
      "aria-label",
      "Edit default policy (currently: No caching)",
    );

    const adaptiveStrategyRadioButton = await screen.findByRole("radio", {
      name: /Adaptive/i,
    });
    await userEvent.click(adaptiveStrategyRadioButton);

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await changeInput(/minimum query duration/i, 1, 5);
    await changeInput(/multiplier/i, 10, 3);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(`Edit default policy (currently: Adaptive)`),
    ).toBeInTheDocument();
  });

  it("lets user change policy for Database 1 from 'Adaptive' to 'Duration' to 'Don't cache to 'Use default'", async () => {
    const editButton = await screen.findByLabelText(
      `Edit policy for database 'Database 1' (currently: Adaptive)`,
    );
    await userEvent.click(editButton);

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    const noCacheStrategyRadioButton = await screen.findByRole("radio", {
      name: /Don.t cache/i,
    });
    await userEvent.click(noCacheStrategyRadioButton);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: No caching)`,
      ),
    ).toBeInTheDocument();

    const durationStrategyRadioButton = await screen.findByRole("radio", {
      name: /keep the cache for a number of hours/i,
    });
    await userEvent.click(durationStrategyRadioButton);

    expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

    await changeInput(/Cache results for this many hours/, 24, 48);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );
    expect(
      await screen.findByTestId("strategy-form-submit-button"),
    ).toHaveTextContent(/Saved/i);

    expect(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    ).toHaveAttribute(
      "aria-label",
      "Edit policy for database 'Database 1' (currently: Duration: 48h)",
    );

    // Switch to Adaptive strategy
    const multiplierStrategyRadioButton = await screen.findByRole("radio", {
      name: /Adaptive/i,
    });
    await userEvent.click(multiplierStrategyRadioButton);

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: Adaptive)`,
      ),
    ).toBeInTheDocument();
  });

  // The Schedule UI -> cron mapping is exhaustively unit-tested in
  // Schedule.unit.spec.tsx. This case is the integration: picking a
  // frequency/day/time in the Schedule fields must flow through Formik's
  // `setFieldValue("schedule", ...)` and end up in the saved strategy, which
  // the launcher label then reads back.
  it("saves a weekly Monday 8 AM schedule and round-trips it through the launcher label", async () => {
    await userEvent.click(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: Adaptive)`,
      ),
    );

    await userEvent.click(
      await screen.findByRole("radio", { name: /Schedule/i }),
    );

    const pickOption = async (testId: string, optionName: string) => {
      await userEvent.click(screen.getByTestId(testId));
      const listbox = await screen.findByRole("listbox");
      await userEvent.click(
        within(listbox).getByRole("option", { name: optionName }),
      );
    };

    await pickOption("select-frequency", "weekly");
    await pickOption("select-weekday", "Monday");
    await pickOption("select-time", "8:00");

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: Scheduled: weekly)`,
      ),
    ).toBeInTheDocument();
  });

  it("can abbreviate a 'Schedule' strategy", () => {
    const strategy: ScheduleStrategy = {
      type: "schedule",
      schedule: "0 0 * * * ?",
      refresh_automatically: false,
    };
    const result = getShortStrategyLabel(strategy);
    expect(result).toBe("Scheduled: hourly");
  });

  it("can abbreviate a 'Duration' strategy", () => {
    const strategy: DurationStrategy = {
      type: "duration",
      duration: 5,
      unit: CacheDurationUnit.Hours,
      refresh_automatically: false,
    };
    const result = getShortStrategyLabel(strategy);
    expect(result).toBe("Duration: 5h");
  });
});

describe("StrategyEditorForDatabases (cache_preemptive enabled)", () => {
  beforeEach(() => {
    setup({
      tokenFeatures: createMockTokenFeatures({
        cache_granular_controls: true,
        cache_preemptive: true,
      }),
    });
  });

  // The preemptive caching switch only renders for question/dashboard targets.
  // Root and database forms must not show it, regardless of strategy.
  it.each([
    ["default policy", /Edit default policy/, /Duration/i],
    ["default policy", /Edit default policy/, /Schedule/i],
    ["a database", /Edit policy for database 'Database 1'/, /Duration/i],
    ["a database", /Edit policy for database 'Database 1'/, /Schedule/i],
  ])(
    "does not show the preemptive caching switch for %s with %p strategy",
    async (_label, launcherLabel, strategyName) => {
      await userEvent.click(await screen.findByLabelText(launcherLabel));
      await userEvent.click(
        await screen.findByRole("radio", { name: strategyName }),
      );
      expect(
        screen.queryByTestId("preemptive-caching-switch"),
      ).not.toBeInTheDocument();
    },
  );
});
