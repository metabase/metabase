import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

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
        failingCount={3}
        ownerlessCount={0}
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
});
