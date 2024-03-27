import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { createMockEntitiesState } from "__support__/store";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
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
    <StrategyEditorForDatabases
      canOverrideRootCacheInvalidationStrategy={true}
    />,
    {
      storeInitialState,
    },
  );
}

const getSaveButton = async () =>
  await screen.findByRole("button", { name: "Save changes" });

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

  it("lets user change default policy from duration to TTL", async () => {
    setup();
    const editButton = await screen.findByLabelText(
      "Edit default policy (currently: Duration)",
    );
    editButton.click();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    const ttlOption = await screen.findByRole("radio", { name: /TTL/i });
    ttlOption.click();
    const minDurationInput = (await screen.findByLabelText(
      /Minimum query duration/,
    )) as HTMLInputElement;
    // Expect save button to be disabled because the form has empty input fields
    expect(await getSaveButton()).toBeDisabled();
    fireEvent.change(minDurationInput, { target: { value: "48" } });
    expect(minDurationInput.value).toBe("48");
    expect(await getSaveButton()).toBeDisabled();
    const multiplierInput = (await screen.findByLabelText(
      /multiplier/,
    )) as HTMLInputElement;
    fireEvent.change(multiplierInput, { target: { value: "3" } });
    expect(multiplierInput.value).toBe("3");
    expect(await getSaveButton()).toBeEnabled();
    (await getSaveButton()).click();
    expect(
      await screen.findByLabelText("Edit default policy (currently: TTL)"),
    ).toBeInTheDocument();
  });
});
