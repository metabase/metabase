import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import {
  createMockCacheConfig,
  createMockCacheConfigWithDoNotCacheStrategy,
  createMockCacheConfigWithDurationStrategy,
  createMockCacheConfigWithTTLStrategy,
} from "metabase-types/api/mocks/performance";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

const storeInitialState = createMockState({
  entities: createMockEntitiesState({}),
  settings: mockSettings(createMockSettings()),
});

function setup() {
  const cacheConfigs = [
    createMockCacheConfigWithTTLStrategy({ model_id: 1 }),
    createMockCacheConfigWithDoNotCacheStrategy({ model_id: 2 }),
    createMockCacheConfigWithDurationStrategy({ model_id: 3 }),
    createMockCacheConfig({
      model: "root",
      model_id: 0,
      strategy: { type: "duration", duration: 1, unit: "hours" },
    }),
  ];
  setupPerformanceEndpoints(cacheConfigs);

  const databases = Array.from({ length: 4 }, (_, i) =>
    createSampleDatabase({ id: i + 1, name: `Database ${i + 1}`, tables: [] }),
  );
  setupDatabasesEndpoints(databases);

  setupEnterprisePlugins();

  return renderWithProviders(
    <StrategyEditorForDatabases canOverrideRootStrategy={true} />,
    {
      storeInitialState,
    },
  );
}

const getSaveButton = async () =>
  await screen.findByTestId("strategy-form-submit-button");

describe("StrategyEditorForDatabases", () => {
  it("should show strategy form launchers", async () => {
    setup();
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

  const changeInput = async (
    label: RegExp,
    expectedPlaceholder: number,
    value: number,
  ) => {
    const input = (await screen.findByLabelText(label)) as HTMLInputElement;
    expect(input).toHaveAttribute(
      "placeholder",
      expectedPlaceholder.toString(),
    );
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveValue(value);
  };

  it("lets user change the default policy from Duration to TTL to No caching", async () => {
    setup();
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
      await changeInput(/minimum query duration/i, 60000, 70000);
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
    setup();
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
      await changeInput(/minimum query duration/i, 60000, 70000);
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
