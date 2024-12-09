import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup } from "./setup";

jest.mock("metabase/dashboard/constants", () => ({
  ...jest.requireActual("metabase/dashboard/constants"),
  DASHBOARD_DESCRIPTION_MAX_LENGTH: 20,
}));

describe("DashboardSettingsSidebar", () => {
  it("should render the component", () => {
    setup();

    expect(screen.getByText("Dashboard settings")).toBeInTheDocument();
    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should close when clicking the close button", async () => {
    const { onClose } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should show dashboard auto-apply filter toggle", async () => {
    await setup();
    expect(screen.getByText("Auto-apply filters")).toBeInTheDocument();
  });

  it("should not render caching section in OSS", async () => {
    await setup();
    expect(screen.queryByText("Caching")).not.toBeInTheDocument();
  });
});
