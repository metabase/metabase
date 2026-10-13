import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { TabCountState } from "metabase/common/components/PillTabNavigation";

import type {
  NotificationsTab,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";
import { trackAlertsManagementTabClicked } from "../analytics";

import { NotificationsTabs } from "./NotificationsTabs";

jest.mock("../analytics", () => ({
  trackAlertsManagementTabClicked: jest.fn<void, [NotificationsTab]>(),
}));

interface SetupOpts {
  tab?: NotificationsTab;
  allCount?: TabCountState;
  failingCount?: TabCountState;
  ownerlessCount?: TabCountState;
}

function setup({
  tab = "all",
  allCount = { status: "loaded", value: 5 },
  failingCount = { status: "loaded", value: 2 },
  ownerlessCount = { status: "loaded", value: 0 },
}: SetupOpts = {}) {
  const onChange = jest.fn<void, [Partial<NotificationsUrlState>]>();
  renderWithProviders(
    <NotificationsTabs
      tab={tab}
      allCount={allCount}
      failingCount={failingCount}
      ownerlessCount={ownerlessCount}
      onChange={onChange}
    />,
    { withRouter: true },
  );
  return { onChange };
}

describe("NotificationsTabs", () => {
  it("defaults Failing to last_check descending and clears the send-status filter", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Failing" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      tab: "failing",
      last_send_status: null,
      sort_column: "last_check",
      sort_direction: "desc",
    });
    expect(trackAlertsManagementTabClicked).toHaveBeenCalledTimes(1);
    expect(trackAlertsManagementTabClicked).toHaveBeenCalledWith("failing");
  });

  it("clears the creator-active filter when switching to Ownerless", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Ownerless" }));
    expect(onChange).toHaveBeenCalledWith({
      tab: "ownerless",
      creator_active: null,
    });
  });

  it("marks the selected tab as the current page", () => {
    setup({ tab: "ownerless" });
    expect(screen.getByRole("button", { name: "Ownerless" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "All alerts" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("shows resolved counts including zero without hiding tabs", () => {
    setup();
    expect(
      within(screen.getByRole("button", { name: "All alerts" })).getByText("5"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Failing" })).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Ownerless" })).getByText("0"),
    ).toBeInTheDocument();
  });

  it("drops a failed badge but keeps navigation available", () => {
    setup({ allCount: { status: "error" } });
    expect(
      within(screen.getByRole("button", { name: "All alerts" })).queryByText(
        /\d/,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Failing" })).getByText("2"),
    ).toBeInTheDocument();
  });

  it("shows a placeholder while the count resolves", () => {
    setup({ failingCount: { status: "loading" } });
    const tab = screen.getByRole("button", { name: "Failing" });
    expect(within(tab).getByTestId("tab-count-skeleton")).toBeInTheDocument();
    expect(within(tab).queryByText(/\d/)).not.toBeInTheDocument();
  });
});
