import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, screen } from "__support__/ui";
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
