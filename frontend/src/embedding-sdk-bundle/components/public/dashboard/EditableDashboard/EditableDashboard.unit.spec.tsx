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

  describe("Subscriptions Button", () => {
    it.each([
      {
        isSlackConfigured: false,
      },
      {
        isSlackConfigured: false,
      },
    ])(
      "should show subscriptions button if subscriptions are enabled and email is set up (isSlackConfigured: $isSlackConfigured)",
      async ({ isSlackConfigured }) => {
        await setup({
          props: { withSubscriptions: true },
          isEmailConfigured: true,
          isSlackConfigured,
        });

        await waitFor(() => {
          expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
        });

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          await dashboardHeader.findByLabelText("Subscriptions"),
        ).toBeInTheDocument();
      },
    );

    it.each([
      {
        isEmailConfigured: false,
        isSlackConfigured: false,
        withSubscriptions: false,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: false,
        withSubscriptions: true,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: true,
        withSubscriptions: false,
      },
      {
        isEmailConfigured: false,
        isSlackConfigured: true,
        withSubscriptions: true,
      },
      {
        isEmailConfigured: true,
        isSlackConfigured: false,
        withSubscriptions: false,
      },
      {
        isEmailConfigured: true,
        isSlackConfigured: true,
        withSubscriptions: false,
      },
    ])(
      "should not show subscriptions button if subscriptions are disabled or email is not configured (isEmailConfigured: $isEmailConfigured, isSlackConfigured: $isSlackConfigured, withSubscriptions: $withSubscriptions)",
      async ({ isEmailConfigured, isSlackConfigured, withSubscriptions }) => {
        await setup({
          props: { withSubscriptions },
          isEmailConfigured,
          isSlackConfigured,
        });

        await waitFor(() => {
          expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
        });

        const dashboardHeader = within(screen.getByTestId("dashboard-header"));

        expect(
          dashboardHeader.queryByLabelText("Subscriptions"),
        ).not.toBeInTheDocument();
      },
    );
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
    // EmbeddingDataPicker makes a call to `/api/search` with limit=0 to decide if SimpleDataPicker should be used
    // then SimpleDataPicker makes a call to `/api/search` to fetch the data
    const dataPickerDataCalls = fetchMock.callHistory.calls("path:/api/search");
    expect(dataPickerDataCalls).toHaveLength(2);
    const dataPickerDataCallUrl = dataPickerDataCalls[1].url;
    expect(dataPickerDataCallUrl).toContain("models=dataset");
    expect(dataPickerDataCallUrl).toContain("models=table");
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
    await setup({ dashcards: [] });

    expect(screen.getByText("This dashboard is empty")).toBeInTheDocument();
    expect(screen.getByText("Add a chart")).toBeInTheDocument();
  });

  it("should allow editing the dashboard title", async () => {
    await setup();

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
