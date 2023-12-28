import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";
import { setupRevisionsEndpoints } from "__support__/server-mocks/revision";
import type { Dashboard } from "metabase-types/api";

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

describe("DashboardInfoSidebar", () => {
  it("should render the component", () => {
    setup();

    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("should allow to set description", () => {
    const { setDashboardAttribute } = setup();

    userEvent.click(screen.getByTestId("editable-text"));
    userEvent.type(
      screen.getByPlaceholderText("Add description"),
      "some description",
    );
    userEvent.tab();

    expect(setDashboardAttribute).toHaveBeenCalledWith(
      "description",
      "some description",
    );
  });

  it("should allow to clear description", () => {
    const { setDashboardAttribute } = setup({
      dashboard: createMockDashboard({ description: "some description" }),
    });

    userEvent.click(screen.getByTestId("editable-text"));
    userEvent.clear(screen.getByPlaceholderText("Add description"));
    userEvent.tab();

    expect(setDashboardAttribute).toHaveBeenCalledWith("description", "");
  });
});
