import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { NotificationsTabs } from "./NotificationsTabs";

jest.mock("../analytics", () => ({
  trackAlertsManagementTabClicked: jest.fn(),
}));

describe("NotificationsTabs", () => {
  it("defaults the Failing tab to sort by last_check so newly surfaced failures aren't buried at the bottom", async () => {
    const onChange = jest.fn();
    renderWithProviders(
      <NotificationsTabs
        tab="all"
        allCount={{ status: "loaded", value: 3 }}
        failingCount={{ status: "loaded", value: 3 }}
        ownerlessCount={{ status: "loaded", value: 0 }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: /Failing/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "failing",
        sort_column: "last_check",
        sort_direction: "desc",
      }),
    );
  });

  it("always renders all three tabs, even when a tab's count is zero", () => {
    renderWithProviders(
      <NotificationsTabs
        tab="all"
        allCount={{ status: "loaded", value: 5 }}
        failingCount={{ status: "loaded", value: 0 }}
        ownerlessCount={{ status: "loaded", value: 0 }}
        onChange={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId("notifications-admin-tab-all"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("notifications-admin-tab-failing"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("notifications-admin-tab-ownerless"),
    ).toBeInTheDocument();
  });

  it("shows the resolved count next to each tab", () => {
    renderWithProviders(
      <NotificationsTabs
        tab="all"
        allCount={{ status: "loaded", value: 5 }}
        failingCount={{ status: "loaded", value: 2 }}
        ownerlessCount={{ status: "loaded", value: 0 }}
        onChange={jest.fn()}
      />,
    );

    expect(
      within(screen.getByTestId("notifications-admin-tab-failing")).getByText(
        "2",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("notifications-admin-tab-ownerless")).getByText(
        "0",
      ),
    ).toBeInTheDocument();
  });

  it("drops the badge when a count fails to load", () => {
    renderWithProviders(
      <NotificationsTabs
        tab="all"
        allCount={{ status: "error" }}
        failingCount={{ status: "loaded", value: 2 }}
        ownerlessCount={{ status: "loaded", value: 0 }}
        onChange={jest.fn()}
      />,
    );

    expect(
      within(screen.getByTestId("notifications-admin-tab-all")).queryByText(
        /\d/,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("notifications-admin-tab-failing")).getByText(
        "2",
      ),
    ).toBeInTheDocument();
  });

  it("shows a loading placeholder instead of a count while it resolves", () => {
    renderWithProviders(
      <NotificationsTabs
        tab="all"
        allCount={{ status: "loading" }}
        failingCount={{ status: "loading" }}
        ownerlessCount={{ status: "loading" }}
        onChange={jest.fn()}
      />,
    );

    const failingTab = screen.getByTestId("notifications-admin-tab-failing");
    expect(
      within(failingTab).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    expect(within(failingTab).queryByText(/\d/)).not.toBeInTheDocument();
  });
});
