import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen, waitFor, within } from "__support__/ui";
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

  it("should show the default policy and database rows", async () => {
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
  // the row label then reads back.
  it("saves a weekly Monday 8 AM schedule and round-trips it through the row label", async () => {
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

  it("does not silently save default values when saving right after switching strategies", async () => {
    // Database 4 inherits the default policy
    await userEvent.click(
      await screen.findByLabelText(/Edit policy for database 'Database 4'/),
    );

    await selectCacheStrategy(/^Duration/i);
    const saveButton = await screen.findByTestId("strategy-form-submit-button");
    await waitFor(() => expect(saveButton).toBeDisabled());
    await userEvent.click(saveButton);
    expect(
      fetchMock.callHistory.calls("path:/api/cache", { method: "PUT" }),
    ).toHaveLength(0);

    await selectCacheStrategy(/Adaptive/i);
    await waitFor(() =>
      expect(screen.getByTestId("strategy-form-submit-button")).toBeDisabled(),
    );

    await changeInput(/minimum query duration/i, 1, 5);
    await changeInput(/multiplier/i, 10, 3);
    await waitFor(() =>
      expect(screen.getByTestId("strategy-form-submit-button")).toBeEnabled(),
    );
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

describe("StrategyEditorForDatabases (table behaviors)", () => {
  it("keeps the default policy row pinned at the top", async () => {
    setup();
    const rows = await screen.findAllByTestId(/^policy-row-/);
    expect(rows[0]).toHaveAccessibleName(/Edit default policy/);
  });

  it("shows the policy in a lighter color for databases using the default policy", async () => {
    setup();
    // Database 4 has no config of its own, so it inherits the default policy
    const inheritingRow = await screen.findByTestId("policy-row-4");
    expect(within(inheritingRow).getByText("Duration: 1h")).toHaveAttribute(
      "data-uses-default-policy",
      "true",
    );
    const overriddenRow = await screen.findByTestId("policy-row-1");
    expect(within(overriddenRow).getByText("Adaptive")).toHaveAttribute(
      "data-uses-default-policy",
      "false",
    );
  });

  it("does not ask to discard again after changes were already discarded", async () => {
    setup();
    await userEvent.click(await screen.findByLabelText(/Edit default policy/));
    await changeInput(/Cache duration/, 0, 48);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Discard your changes?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Discard" }),
    );

    await userEvent.click(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    );
    expect(
      await screen.findByTestId("cache-strategy-select"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("navigates between rows with the sidesheet chevrons", async () => {
    setup();
    await userEvent.click(await screen.findByLabelText(/Edit default policy/));

    const previousButton = await screen.findByLabelText("Previous item");
    expect(previousButton).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Next item"));

    const sidesheet = await screen.findByTestId("cache-policy-panel");
    expect(
      await within(sidesheet).findByText("Database 1"),
    ).toBeInTheDocument();
  });

  it("keeps the row highlight while a discard confirmation is open", async () => {
    setup();
    await userEvent.click(await screen.findByLabelText(/Edit default policy/));
    await changeInput(/Cache duration/, 0, 48);

    await userEvent.click(
      await screen.findByLabelText(/Edit policy for database 'Database 1'/),
    );
    await screen.findByText("Discard your changes?");

    expect(screen.getByTestId("policy-row-0")).toHaveAttribute(
      "data-keyboard-active",
      "true",
    );
    expect(screen.getByTestId("policy-row-1")).not.toHaveAttribute(
      "data-keyboard-active",
    );
  });

  it("moves the row highlight when navigating with the chevrons", async () => {
    setup();
    await userEvent.click(await screen.findByLabelText(/Edit default policy/));
    await userEvent.click(await screen.findByLabelText("Next item"));

    await waitFor(() => {
      expect(screen.getByTestId("policy-row-1")).toHaveAttribute(
        "data-keyboard-active",
        "true",
      );
    });
    expect(screen.getByTestId("policy-row-0")).not.toHaveAttribute(
      "data-keyboard-active",
    );
  });
});

describe("StrategyEditorForDatabases (search)", () => {
  it("does not show search with 10 or fewer items", async () => {
    setup();
    await screen.findByLabelText(/Edit default policy/);
    expect(
      screen.queryByPlaceholderText("Search by name or policy…"),
    ).not.toBeInTheDocument();
  });

  it("shows search with more than 10 items and filters rows, including the default policy row", async () => {
    setup({ databaseCount: 12 });
    const searchInput = await screen.findByPlaceholderText(
      "Search by name or policy…",
    );
    expect(
      await screen.findByLabelText(/Edit default policy/),
    ).toBeInTheDocument();

    await userEvent.type(searchInput, "Database 10");

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Edit default policy/),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByLabelText(/Edit policy for database 'Database 10'/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Edit policy for database 'Database 11'/),
    ).not.toBeInTheDocument();
  });
});

describe("StrategyEditorForDatabases (reset all to default)", () => {
  it("hides the reset-all button when no database has its own policy", async () => {
    setup({
      cacheConfigs: [
        createMockCacheConfig({
          model: "root",
          model_id: 0,
          strategy: {
            type: "duration",
            duration: 1,
            unit: CacheDurationUnit.Hours,
            refresh_automatically: false,
          },
        }),
      ],
    });
    await screen.findByLabelText(/Edit default policy/);
    expect(
      screen.queryByLabelText("Reset all to default"),
    ).not.toBeInTheDocument();
  });

  it("resets all database policies after confirmation", async () => {
    setup();
    await userEvent.click(await screen.findByLabelText("Reset all to default"));

    const dialog = await screen.findByRole("dialog", {
      name: "Reset all to default?",
    });
    expect(
      within(dialog).getByText(
        "This will reset all database caching policies to their default values.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Reset all to default" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/cache", { method: "DELETE" }),
      ).toHaveLength(1);
    });

    expect(
      await screen.findByLabelText(
        /Edit policy for database 'Database 1' \(currently inheriting the default policy/,
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByLabelText("Reset all to default"),
      ).not.toBeInTheDocument();
    });
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
