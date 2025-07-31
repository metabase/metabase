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

import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../tests/setup";

import { EditableDashboard } from "./EditableDashboard";

const setup = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: EditableDashboard,
  });
};

describe("EditableDashboard", () => {
  it("should support dashboard editing", async () => {
    await setup();

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
    await setup({
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
    await setup({
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

  it("should allow to create a new question in addition to adding existing questions", async () => {
    await setup();
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
    // Data picker makes two calls: model count and data sources
    const dataPickerDataCalls = fetchMock.calls("path:/api/search");
    expect(dataPickerDataCalls).toHaveLength(2);

    // Should make a call to counts the data sources (tables and models)
    const countDataSourceCall = dataPickerDataCalls.filter(([url]) =>
      url.includes("models=dataset&models=table"),
    );
    expect(countDataSourceCall).toHaveLength(1);

    // Should make a call to counts models
    const countModelCall = dataPickerDataCalls.filter(
      ([url]) =>
        url.includes("models=dataset") && !url.includes("models=table"),
    );
    expect(countModelCall).toHaveLength(1);
  });

  it("should allow to go back to the dashboard after seeing the query builder", async () => {
    await setup({
      dashboardName: "Test dashboard",
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

    // We should be in the query builder
    expect(
      await screen.findByRole("button", { name: "Back to Test dashboard" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Back to Test dashboard" }),
    );

    // We should be back in the dashboard
    expect(
      screen.getByText("You're editing this dashboard."),
    ).toBeInTheDocument();
  });

  it("should allow to pass `dataPickerProps.entityTypes` to the query builder", async () => {
    await setup({
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

    const dataPickerDataCalls = fetchMock.calls("path:/api/search");
    expect(dataPickerDataCalls).toHaveLength(2);

    // Find the call that fetches only models (should be the filtered data sources call)
    const modelOnlyCall = dataPickerDataCalls.find(
      ([url]) =>
        url.includes("models=dataset") && !url.includes("models=table"),
    );
    expect(modelOnlyCall).toBeDefined();
    const [modelOnlyCallUrl] = modelOnlyCall;
    expect(modelOnlyCallUrl).toContain("models=dataset");
    expect(modelOnlyCallUrl).not.toContain("models=table");
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
