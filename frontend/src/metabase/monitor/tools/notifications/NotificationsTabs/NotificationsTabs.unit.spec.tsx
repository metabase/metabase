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
    await userEvent.click(screen.getByRole("tab", { name: "Failing" }));
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
    await userEvent.click(screen.getByRole("tab", { name: "Ownerless" }));
    expect(onChange).toHaveBeenCalledWith({
      tab: "ownerless",
      creator_active: null,
    });
  });

  it("marks the selected tab", () => {
    setup({ tab: "ownerless" });
    expect(screen.getByRole("tab", { name: "Ownerless" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "All alerts" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("maps each dataset count to its tab", () => {
    setup();
    expect(
      within(screen.getByRole("tab", { name: "All alerts" })).getByText("5"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("tab", { name: "Failing" })).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("tab", { name: "Ownerless" })).getByText("0"),
    ).toBeInTheDocument();
  });
});
