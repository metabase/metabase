import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { Menu } from "metabase/ui";
import { createMockDashboard } from "metabase-types/api/mocks";

import {
  AutoRefreshMenuItem,
  AutoRefreshMenuOptions,
} from "./AutoRefreshMenuItem";

const setup = ({
  children,
  refreshPeriod = null,
  onRefreshPeriodChange = jest.fn(),
}: {
  children: ReactNode;
  refreshPeriod?: number | null;
  onRefreshPeriodChange?: jest.Mock;
}) => {
  const dashboard = createMockDashboard();

  renderWithProviders(
    <Menu opened>
      <Menu.Dropdown>
        <MockDashboardContext
          dashboardId={dashboard.id}
          dashboard={dashboard}
          refreshPeriod={refreshPeriod}
          onRefreshPeriodChange={onRefreshPeriodChange}
          setRefreshElapsedHook={jest.fn()}
          isFullscreen={false}
          onFullscreenChange={jest.fn()}
        >
          {children}
        </MockDashboardContext>
      </Menu.Dropdown>
    </Menu>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: { ...dashboard, dashcards: [] },
          },
        }),
      },
    },
  );
};

describe("AutoRefreshMenuItem", () => {
  it("should render the trigger with a right chevron and call onClick", async () => {
    const onClick = jest.fn();
    setup({ children: <AutoRefreshMenuItem onClick={onClick} /> });

    const trigger = screen.getByTestId("dashboard-auto-refresh-menu-item");
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText("Auto-refresh")).toBeInTheDocument();
    expect(screen.getByLabelText("chevronright icon")).toBeInTheDocument();

    await userEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("AutoRefreshMenuOptions", () => {
  it("should render the 'Auto Refresh' heading and interval options", () => {
    setup({ children: <AutoRefreshMenuOptions onSelect={jest.fn()} /> });

    expect(screen.getByText("Auto Refresh")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("1 minute")).toBeInTheDocument();
    expect(screen.getByText("60 minutes")).toBeInTheDocument();
  });

  it("should not render a divider or a clickable back heading", () => {
    setup({ children: <AutoRefreshMenuOptions onSelect={jest.fn()} /> });

    // The all-caps heading is a plain, non-interactive label (not a menu item)
    expect(screen.getByText("Auto Refresh")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Auto Refresh/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("should apply the selected period and call onSelect", async () => {
    const onSelect = jest.fn();
    const onRefreshPeriodChange = jest.fn();
    setup({
      children: <AutoRefreshMenuOptions onSelect={onSelect} />,
      onRefreshPeriodChange,
    });

    await userEvent.click(screen.getByText("5 minutes"));

    expect(onRefreshPeriodChange).toHaveBeenCalledWith(300);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("should mark the currently selected period", () => {
    setup({
      children: <AutoRefreshMenuOptions onSelect={jest.fn()} />,
      refreshPeriod: 60,
    });

    const selectedOption = screen.getByRole("menuitem", { name: /1 minute/ });
    expect(within(selectedOption).getByLabelText("check icon")).toHaveStyle({
      visibility: "visible",
    });

    const unselectedOption = screen.getByRole("menuitem", { name: /Off/ });
    expect(within(unselectedOption).getByLabelText("check icon")).toHaveStyle({
      visibility: "hidden",
    });
  });
});
