import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";

import {
  type SetupSdkDashboardProps,
  setup as setupSdkDashboard,
} from "./setup";

const setup = (args: SetupSdkDashboardProps = {}) =>
  setupSdkDashboard({
    mode: "editable",
    ...args,
  });

describe("EditableDashboard", () => {
  it("should support dashboard editing", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    const editButton = within(
      screen.getByTestId("dashboard-header"),
    ).getByLabelText(`pencil icon`);

    expect(editButton).toBeInTheDocument();

    await userEvent.click(editButton);

    expect(
      screen.getByText("You're editing this dashboard."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("should allow title editing", async () => {
    await setup();

    const titleInput = await screen.findByTestId("dashboard-name-heading");

    userEvent.click(titleInput);
    userEvent.clear(titleInput);

    await userEvent.type(titleInput, "Oisin", { delay: 50 });

    userEvent.tab();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Oisin")).toBeInTheDocument();
    });
  });
});
