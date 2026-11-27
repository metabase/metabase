jest.unmock("metabase/querying/components/NativeQueryEditor");

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockDataset,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NativeQueryModal } from "./NativeQueryModal";

registerVisualizations();

const CARD = createMockCard({
  id: 1,
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "SELECT 1",
  }),
});

function setup() {
  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(
    <NativeQueryModal
      card={CARD}
      isOpen
      onClose={jest.fn()}
      onSave={jest.fn()}
    />,
    {
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
        settings: createMockSettingsState(createMockSettings()),
      },
    },
  );
}

async function runAndCancelQuery() {
  const pendingResponse = defer();
  fetchMock.post("path:/api/dataset", () => pendingResponse.promise, {
    name: "pending-dataset",
  });

  await userEvent.click(await screen.findByTestId("run-button"));
  await waitFor(() =>
    expect(screen.getByTestId("run-button")).toHaveAccessibleName("Cancel"),
  );
  await userEvent.click(screen.getByTestId("run-button"));
  await waitFor(() =>
    expect(screen.getByTestId("run-button")).toHaveAccessibleName("Refresh"),
  );
}

describe("NativeQueryModal", () => {
  it("does not show error after cancelling first query", async () => {
    setup();

    await runAndCancelQuery();

    expect(
      await screen.findByText("Here's where your results will appear"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Query execution failed"),
    ).not.toBeInTheDocument();
  });

  it("keeps previous result after cancelling query", async () => {
    fetchMock.post(
      "path:/api/dataset",
      createMockDataset({ data: { rows: [[1]] } }),
      { name: "first-dataset" },
    );
    setup();

    await userEvent.click(await screen.findByTestId("run-button"));
    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1),
    );
    fetchMock.removeRoute("first-dataset");
    await runAndCancelQuery();

    expect(
      screen.queryByText("Query execution failed"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Here's where your results will appear"),
    ).not.toBeInTheDocument();
  });
});
