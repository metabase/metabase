import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { createMockCollection } from "metabase-types/api/mocks";

import { addPremiumSubscriptionsTests } from "../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../tests/setup";

import { EditableDashboard } from "./EditableDashboard";

const setupPremium = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    tokenFeatures: {
      embedding_sdk: true,
    },
    enterprisePlugins: ["sdk_notifications", "embedding"],
    component: EditableDashboard,
  });
};

describe("EditableDashboard", () => {
  addPremiumSubscriptionsTests(setupPremium);

  it("should allow to create a new question in addition to adding existing questions", async () => {
    await setupPremium();
    setupSimpleDataPickerEndpoints();

    expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("dashboard-header")).getByLabelText(
        "Edit dashboard",
      ),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add questions" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "New Question" }));

    // We should render the simple data picker at this point
    expect(screen.queryByTestId("dashboard-header")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Pick your starting data" }),
    ).toBeInTheDocument();

    // Default `entityTypes` should be `["model", "table"]`
    // EmbeddingDataPicker makes a call to `/api/search` with limit=0 to decide if SimpleDataPicker should be used
    // then SimpleDataPicker makes a call to `/api/search` to fetch the data
    const dataPickerDataCalls = fetchMock.callHistory.calls("path:/api/search");
    expect(dataPickerDataCalls).toHaveLength(2);
    const dataPickerDataCallUrl = dataPickerDataCalls[1].url;
    expect(dataPickerDataCallUrl).toContain("models=dataset");
    expect(dataPickerDataCallUrl).toContain("models=table");
  });
});

function setupSimpleDataPickerEndpoints() {
  // These endpoints are used in the simple data picker
  setupCollectionItemsEndpoint({
    collection: createMockCollection(ROOT_COLLECTION),
    collectionItems: [],
  });
  setupEmbeddingDataPickerDecisionEndpoints("flat");
  setupSearchEndpoints([]);
}
