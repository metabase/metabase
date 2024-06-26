import userEvent from "@testing-library/user-event";

import { setupRevisionsEndpoints } from "__support__/server-mocks/revision";
import { renderWithProviders, screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

import { DashboardInfoSidebar } from "./DashboardInfoSidebar";

interface SetupOpts {
  dashboard?: Dashboard;
}

function setup({ dashboard = createMockDashboard() }: SetupOpts = {}) {
  const setDashboardAttribute = jest.fn();

  setupRevisionsEndpoints([]);

  renderWithProviders(
    <DashboardInfoSidebar
      dashboard={dashboard}
      setDashboardAttribute={setDashboardAttribute}
    />,
  );

  return {
    setDashboardAttribute,
  };
}

jest.mock("metabase/dashboard/constants", () => ({
  ...jest.requireActual("metabase/dashboard/constants"),
  DASHBOARD_DESCRIPTION_MAX_LENGTH: 20,
}));

describe("DashboardInfoSidebar", () => {
  it("should render the component", () => {
    setup();

    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("should allow to set description", async () => {
    const { setDashboardAttribute } = setup();

    await userEvent.click(screen.getByTestId("editable-text"));
    await userEvent.type(
      screen.getByPlaceholderText("Add description"),
      "some description",
    );
    await userEvent.tab();

    expect(setDashboardAttribute).toHaveBeenCalledWith(
      "description",
      "some description",
    );
  });

  it("should validate description length", async () => {
    const expectedErrorMessage = "Must be 20 characters or less";
    const { setDashboardAttribute } = setup();

    await userEvent.click(screen.getByTestId("editable-text"));
    await userEvent.type(
      screen.getByPlaceholderText("Add description"),
      "in incididunt incididunt laboris ut elit culpa sit dolor amet",
    );
    await userEvent.tab();

    expect(screen.getByText(expectedErrorMessage)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("editable-text"));
    expect(screen.queryByText(expectedErrorMessage)).not.toBeInTheDocument();

    await userEvent.tab();
    expect(screen.getByText(expectedErrorMessage)).toBeInTheDocument();

    expect(setDashboardAttribute).not.toHaveBeenCalled();
  });

  it("should allow to clear description", async () => {
    const { setDashboardAttribute } = setup({
      dashboard: createMockDashboard({ description: "some description" }),
    });

    await userEvent.click(screen.getByTestId("editable-text"));
    await userEvent.clear(screen.getByPlaceholderText("Add description"));
    await userEvent.tab();

    expect(setDashboardAttribute).toHaveBeenCalledWith("description", "");
  });
});
