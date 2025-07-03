import userEvent from "@testing-library/user-event";

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
    // These endpoints are used in the simple data picker
    setupCollectionItemsEndpoint({
      collection: createMockCollection(ROOT_COLLECTION),
      collectionItems: [],
    });
    setupEmbeddingDataPickerDecisionEndpoints("flat");
    setupSearchEndpoints([]);

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
  });
});
