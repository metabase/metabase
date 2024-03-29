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

// TODO: Might not need this
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

  it.each(["default policy", "policy for database 'Database 1'"])(
    "lets user change the $policyName from duration to TTL to Duration to Don't cache",
    async (policyName: string) => {
      setup();
      // TODO: Why is the initial policy TTL for the database? It should be 'Use default'
      const initialPolicy = policyName === 'default policy' ? 'Duration' : 'TTL';
      const editButton = await screen.findByLabelText(
        `Edit ${policyName} (currently: ${initialPolicy})`,
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
        const minDurationInput = (await screen.findByLabelText(
          /Minimum query duration/,
        )) as HTMLInputElement;
        expect(minDurationInput).toHaveAttribute("placeholder", "60000");
        fireEvent.change(minDurationInput, { target: { value: 70000 } });
        expect(minDurationInput).toHaveValue(70000);

        const multiplierInput = await screen.findByRole("spinbutton", {
          name: /multiplier/,
        });
        expect(multiplierInput).toHaveAttribute("placeholder", "10");
        fireEvent.change(multiplierInput, { target: { value: "3" } });
        expect(multiplierInput).toHaveValue(3);
      });

      (await screen.findByTestId("strategy-form-submit-button")).click();

      expect(
        await screen.findByLabelText(`Edit ${policyName} (currently: TTL)`),
      ).toBeInTheDocument();

      await act(async () => {
        const durationStrategyRadioButton = await screen.findByRole("radio", {
          name: /Duration/i,
        });
        durationStrategyRadioButton.click();

        expect((await screen.findAllByRole("spinbutton")).length).toBe(1);

        const durationInput = await screen.findByRole("spinbutton", {
          name: /Cache result for this many hours/,
        });
        expect(durationInput).toHaveAttribute("placeholder", "24");
        fireEvent.change(durationInput, { target: { value: "48" } });
        expect(durationInput).toHaveValue(48);
      });

      (await screen.findByTestId("strategy-form-submit-button")).click();

      expect(
        await screen.findByLabelText(
          `Edit ${policyName} (currently: Duration)`,
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
          `Edit ${policyName} (currently: No caching)`,
        ),
      ).toBeInTheDocument();
    },
  );

  // it.skip("lets user change database policy from default to TTL", async () => {
  //   setup();
  //   const editButton = await screen.findByLabelText(
  //     "Edit default policy (currently: Duration)",
  //   );

  //   // TODO: Change the content of this function

  //   editButton.click();
  //   expect(
  //     screen.queryByRole("button", { name: "Save changes" }),
  //   ).not.toBeInTheDocument();
  //   const ttlOption = await screen.findByRole("radio", { name: /TTL/i });
  //   ttlOption.click();
  //   const minDurationInput = (await screen.findByLabelText(
  //     /Minimum query duration/,
  //   )) as HTMLInputElement;
  //   fireEvent.change(minDurationInput, { target: { value: "48" } });
  //   expect(minDurationInput.value).toBe("48");
  //   const multiplierInput = (await screen.findByLabelText(
  //     /multiplier/,
  //   )) as HTMLInputElement;
  //   fireEvent.change(multiplierInput, { target: { value: "3" } });
  //   expect(multiplierInput.value).toBe("3");
  //   (await getSaveButton()).click();
  //   expect(
  //     await screen.findByLabelText("Edit default policy (currently: TTL)"),
  //   ).toBeInTheDocument();
  // });
});
