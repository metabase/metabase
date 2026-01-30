import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupEmbeddingDataPickerDecisionEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { createMockCollection } from "metabase-types/api/mocks";

import { addEnterpriseAutoRefreshTests } from "../shared-tests/auto-refresh.spec";
import { addEnterpriseSubscriptionsTests } from "../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../tests/setup";

import { EditableDashboard } from "./EditableDashboard";

const setupEnterprise = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    enterprisePlugins: ["sdk_notifications", "embedding"],
    component: EditableDashboard,
  });
};

describe("EditableDashboard", () => {
  addEnterpriseSubscriptionsTests(setupEnterprise);
  addEnterpriseAutoRefreshTests(setupEnterprise);

  it("should support dashboard editing", async () => {
    await setupEnterprise();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const editButton = within(
      screen.getByTestId("dashboard-header"),
    ).getByLabelText(`pencil icon`);

    expect(editButton).toBeInTheDocument();

    await userEvent.click(editButton);

    expect(
      screen.getByText("You're editing this dashboard."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("should show the edit and download button if downloads are enabled", async () => {
    await setupEnterprise({
      props: { withDownloads: true },
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));

    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(2);

    expect(
      dashboardHeader.getByLabelText("Edit dashboard"),
    ).toBeInTheDocument();

    expect(
      dashboardHeader.getByLabelText("Download as PDF"),
    ).toBeInTheDocument();
  });

  it("should not show download button if downloads are disabled", async () => {
    await setupEnterprise({
      props: { withDownloads: false },
    });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const dashboardHeader = within(screen.getByTestId("dashboard-header"));

    expect(
      dashboardHeader.getAllByTestId("dashboard-header-row-button"),
    ).toHaveLength(1);

    expect(
      dashboardHeader.getByLabelText("Edit dashboard"),
    ).toBeInTheDocument();

    expect(
      dashboardHeader.queryByLabelText("Download as PDF"),
    ).not.toBeInTheDocument();
  });

  it("should allow to go back to the dashboard after seeing the query builder", async () => {
    await setupEnterprise({ dashboardName: "Test dashboard" });
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

    // We should be in the query builder
    expect(
      await screen.findByText(/Back to Test dashboard/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Back to Test dashboard/));

    // We should be back in the dashboard
    expect(screen.getByText("Test dashboard")).toBeInTheDocument();
  });

  it("should allow to pass `dataPickerProps.entityTypes` to the query builder", async () => {
    await setupEnterprise({
      dataPickerProps: {
        entityTypes: ["model"],
      },
    });
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
    expect(dataPickerDataCallUrl).not.toContain("models=table");
  });

  it("should show 'Add a chart' button on empty dashboards", async () => {
    await setupEnterprise({ dashcards: [] });

    expect(screen.getByText("This dashboard is empty")).toBeInTheDocument();
    expect(screen.getByText("Add a chart")).toBeInTheDocument();
  });

  it("should allow editing the dashboard title", async () => {
    await setupEnterprise();

    expect(screen.getByTestId("dashboard-name-heading")).toBeEnabled();
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
