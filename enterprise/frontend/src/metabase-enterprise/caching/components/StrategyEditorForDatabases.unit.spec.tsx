import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen, within } from "__support__/ui";
import type { SetupOpts } from "metabase/admin/performance/components/test-utils";
import {
  setupStrategyEditorForDatabases as baseSetup,
  changeInput,
  getCacheStrategySelect,
  getSaveButton,
  selectCacheStrategy,
} from "metabase/admin/performance/components/test-utils";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { PLUGIN_CACHING } from "metabase/plugins";
import {
  CacheDurationUnit,
  type DurationStrategy,
  type ScheduleStrategy,
} from "metabase-types/api";
import {
  createMockCacheConfig,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

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
    await userEvent.click(getCacheStrategySelect());
    expect(await screen.findAllByRole("option")).toHaveLength(4);
  });

  it("shows five policy options for a database (adds 'Default')", async () => {
    await userEvent.click(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    );
    await userEvent.click(getCacheStrategySelect());
    expect(await screen.findAllByRole("option")).toHaveLength(5);
    expect(
      screen.getByRole("option", { name: /^Default/i }),
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

    expect(await getCacheStrategySelect()).toHaveValue("Duration");

    expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

    await changeInput(/Cache duration/, 0, 48);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        `Edit default policy (currently: Duration: 48h)`,
      ),
    ).toBeInTheDocument();

    await selectCacheStrategy(/Don.t cache/i);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(await screen.findByLabelText(/Edit default policy/)).toHaveAttribute(
      "aria-label",
      "Edit default policy (currently: No caching)",
    );

    await selectCacheStrategy(/Adaptive/i);

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

  it("lets user change policy for Database 1 from 'Adaptive' to 'Duration' to 'Don't cache to 'Default'", async () => {
    const editButton = await screen.findByLabelText(
      `Edit policy for database 'Database 1' (currently: Adaptive)`,
    );
    await userEvent.click(editButton);

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    await selectCacheStrategy(/Don.t cache/i);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: No caching)`,
      ),
    ).toBeInTheDocument();

    await selectCacheStrategy(/^Duration/i);

    expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

    expect(await screen.findByTestId("duration-unit-select")).toHaveValue(
      "hours",
    );

    await changeInput(/Cache duration/, 0, 48);

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    ).toHaveAttribute(
      "aria-label",
      "Edit policy for database 'Database 1' (currently: Duration: 48h)",
    );

    // Switch to Adaptive strategy
    await selectCacheStrategy(/Adaptive/i);

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

    await selectCacheStrategy(/^Schedule/i);

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

  it.each([
    [CacheDurationUnit.Hours, "Duration: 5h"],
    [CacheDurationUnit.Minutes, "Duration: 5m"],
    [CacheDurationUnit.Seconds, "Duration: 5s"],
    [CacheDurationUnit.Days, "Duration: 5d"],
  ])("can abbreviate a 'Duration' strategy with unit %s", (unit, expected) => {
    const strategy: DurationStrategy = {
      type: "duration",
      duration: 5,
      unit,
      refresh_automatically: false,
    };
    expect(getShortStrategyLabel(strategy)).toBe(expected);
  });

  it("does not allow saving an empty cache duration", async () => {
    await userEvent.click(
      await screen.findByLabelText(
        "Edit default policy (currently: Duration: 1h)",
      ),
    );

    const input = await screen.findByRole("spinbutton", {
      name: /Cache duration/,
    });
    await userEvent.clear(input);
    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByText("Enter a positive number."),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/cache", { method: "PUT" }),
    ).toHaveLength(0);
  });

  it("pluralizes the unit options with the entered duration", async () => {
    await userEvent.click(
      await screen.findByLabelText(
        "Edit default policy (currently: Duration: 1h)",
      ),
    );

    expect(await screen.findByTestId("duration-unit-select")).toHaveValue(
      "hour",
    );

    await changeInput(/Cache duration/, 0, 2);

    expect(await screen.findByTestId("duration-unit-select")).toHaveValue(
      "hours",
    );
  });

  it("lets user change the duration unit", async () => {
    await userEvent.click(
      await screen.findByLabelText(
        "Edit default policy (currently: Duration: 1h)",
      ),
    );

    await userEvent.click(await screen.findByTestId("duration-unit-select"));
    await userEvent.click(
      await screen.findByRole("option", { name: "minute" }),
    );

    await userEvent.click(
      await screen.findByTestId("strategy-form-submit-button"),
    );

    expect(
      await screen.findByLabelText(
        "Edit default policy (currently: Duration: 1m)",
      ),
    ).toBeInTheDocument();
  });
});

describe("StrategyEditorForDatabases (sub-hour duration policy)", () => {
  beforeEach(() => {
    setup({
      cacheConfigs: [
        createMockCacheConfig({
          model: "root",
          model_id: 0,
          strategy: {
            type: "duration",
            duration: 30,
            unit: CacheDurationUnit.Minutes,
            refresh_automatically: false,
          },
        }),
      ],
    });
  });

  it("shows a policy stored with a sub-hour unit faithfully", async () => {
    await userEvent.click(
      await screen.findByLabelText(
        "Edit default policy (currently: Duration: 30m)",
      ),
    );

    expect(await getCacheStrategySelect()).toHaveValue("Duration");
    expect(
      await screen.findByRole("spinbutton", { name: /Cache duration/ }),
    ).toHaveValue(30);
    expect(await screen.findByTestId("duration-unit-select")).toHaveValue(
      "minutes",
    );
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
    ["default policy", /Edit default policy/, /^Duration/i],
    ["default policy", /Edit default policy/, /^Schedule/i],
    ["a database", /Edit policy for database 'Database 1'/, /^Duration/i],
    ["a database", /Edit policy for database 'Database 1'/, /^Schedule/i],
  ])(
    "does not show the preemptive caching switch for %s with %p strategy",
    async (_label, launcherLabel, strategyName) => {
      await userEvent.click(await screen.findByLabelText(launcherLabel));
      await selectCacheStrategy(strategyName);
      expect(
        screen.queryByTestId("preemptive-caching-switch"),
      ).not.toBeInTheDocument();
    },
  );
});
