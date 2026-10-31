import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("InsightsAction (OSS)", () => {
  it("opens the usage analytics upsell for admins", async () => {
    await setup({ isUserAdmin: true });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Insights" }));

    expect(
      await screen.findByText("See who’s doing what, when"),
    ).toBeInTheDocument();
  });

  it("renders nothing for non-admins", async () => {
    await setup({ isForADashboard: true, isUserAdmin: false });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
