import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";

import { setup as setupSdkDashboard } from "./setup";

const setup = (args = {}) =>
  setupSdkDashboard({
    mode: "static",
    ...args,
  });

describe("StaticDashboard", () => {
  it("should not allow editing", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    // Edit button should not be present
    const header = screen.getByTestId("dashboard-header");
    expect(
      within(header).queryByLabelText("pencil icon"),
    ).not.toBeInTheDocument();
  });

  it("should not allow drilling through to questions", async () => {
    await setup();

    // Click on card title, but it shouldn't navigate
    await userEvent.click(screen.getByText("Here is a card title"));

    // Should not navigate to question view
    expect(
      screen.queryByTestId("query-visualization-root"),
    ).not.toBeInTheDocument();

    // Should still be on dashboard
    expect(screen.getByTestId("dashboard-grid")).toBeInTheDocument();
  });
});
