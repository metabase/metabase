import fetchMock from "fetch-mock";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DataSourceSelector } from "../DataSelector";

const databases = [createSampleDatabase()];

const storeInitialState = createMockState({
  settings: createMockSettingsState({
    "enable-nested-queries": true,
  }),
});

const AVAILABLE_MODELS: Record<AvailableModels, ("dataset" | "table")[]> = {
  "tables-only": ["table"],
  "models-only": ["dataset"],
  "tables-and-models": ["dataset", "table"],
};

type AvailableModels = "tables-only" | "models-only" | "tables-and-models";

interface SetupOpts {
  isJoinStep?: boolean;
  availableModels?: AvailableModels;
}

function setup({
  isJoinStep = false,
  availableModels = "tables-only",
}: SetupOpts = {}) {
  fetchMock.get(
    {
      url: "path:/api/search",
      query: {
        calculate_available_models: true,
        limit: 0,
        models: ["dataset"],
      },
    },
    {
      data: [],
      limit: 0,
      models: ["dataset"],
      offset: 0,
      table_db_id: null,
      engine: "search.engine/in-place",
      total: 1,
      available_models: AVAILABLE_MODELS[availableModels],
    },
  );

  setupDatabasesEndpoints(databases, undefined, { saved: true });

  return renderWithProviders(
    <DataSourceSelector
      isInitiallyOpen
      canChangeDatabase={!isJoinStep}
      selectedDatabaseId={null}
      canSelectModel={true}
      canSelectTable={true}
      triggerElement={<div />}
      setSourceTableFn={jest.fn()}
    />,
    { storeInitialState },
  );
}

describe("DataSourceSelector", () => {
  it("should close the picker when clicking outside", async () => {
    setup();

    expect(await screen.findByText("Sample Database")).toBeInTheDocument();
    expect(await screen.findByText("Orders")).toBeInTheDocument();
  });
});
