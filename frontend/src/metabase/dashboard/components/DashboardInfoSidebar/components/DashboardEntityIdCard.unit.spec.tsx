import { getMantineSelectOptions } from "__support__/components/mantineSelect";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDashboard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { DashboardEntityIdCard } from "./DashboardEntityIdCard"; // Adjust the import path as needed

describe("DashboardEntityIdCard", () => {
  it("should display all tabs from the dashboard as options in the Select", async () => {
    const dashboard = createMockDashboard({
      tabs: [
        createMockDashboardTab({ id: 1, name: "Tab 1" }),
        createMockDashboardTab({ id: 2, name: "Tab 2" }),
        createMockDashboardTab({ id: 3, name: "Tab 3" }),
      ],
    });
    renderWithProviders(<DashboardEntityIdCard dashboard={dashboard} />);

    const { optionTextContents, displayedOption } =
      await getMantineSelectOptions();
    expect(optionTextContents).toEqual(["Tab 1", "Tab 2", "Tab 3"]);
    expect(displayedOption.value).toBe("Tab 1");
  });

  it("does not display a select, if there are no tabs", () => {
    const dashboard = createMockDashboard();
    renderWithProviders(<DashboardEntityIdCard dashboard={dashboard} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
