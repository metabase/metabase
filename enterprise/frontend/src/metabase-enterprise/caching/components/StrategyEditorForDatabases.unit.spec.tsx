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
      await screen.findByLabelText("Edit default policy (currently: Duration)"),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByLabelText(/Edit policy for database/),
    ).toHaveLength(4);
    expect(
      await screen.findByLabelText(
        "Edit policy for database 'Database 1' (currently: TTL)",
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

  it("lets user change the default policy from Duration to TTL to No caching", async () => {
    const editButton = await screen.findByLabelText(
      `Edit default policy (currently: Duration)`,
    );
    editButton.click();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    const ttlStrategyRadioButton = await screen.findByRole("radio", {
      name: /TTL/i,
    });
    ttlStrategyRadioButton.click();

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    expect(await getSaveButton()).toBeInTheDocument();

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(`Edit default policy (currently: TTL)`),
    ).toBeInTheDocument();

    await act(async () => {
      const durationStrategyRadioButton = await screen.findByRole("radio", {
        name: /duration/i,
      });
      durationStrategyRadioButton.click();

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
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(
        `Edit default policy (currently: No caching)`,
      ),
    ).toBeInTheDocument();
  });

  it("lets user change policy for Database 1 from TTL to Duration to Don't cache to Use default", async () => {
    const editButton = await screen.findByLabelText(
      `Edit policy for database 'Database 1' (currently: TTL)`,
    );
    editButton.click();

    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();

    const ttlStrategyRadioButton = await screen.findByRole("radio", {
      name: /TTL/i,
    });
    expect(ttlStrategyRadioButton).toBeChecked();

    expect((await screen.findAllByRole("spinbutton")).length).toBe(2);

    await act(async () => {
      await changeInput(/minimum query duration/i, 1, 5);
      await changeInput(/multiplier/i, 10, 3);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: TTL)`,
      ),
    ).toBeInTheDocument();

    await act(async () => {
      const durationStrategyRadioButton = await screen.findByRole("radio", {
        name: /duration/i,
      });
      durationStrategyRadioButton.click();

      expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

      await changeInput(/Cache results for this many hours/, 24, 48);
    });

    (await screen.findByTestId("strategy-form-submit-button")).click();

    expect(
      await screen.findByLabelText(
        `Edit policy for database 'Database 1' (currently: Duration)`,
      ),
    ).toBeInTheDocument();

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
  });
});
