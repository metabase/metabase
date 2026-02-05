import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { RunInfo } from "./RunInfo";

type SetupOpts = {
  message?: string;
  endTime?: Date | null;
};

function setup({
  message = "Test error message",
  endTime = null,
}: SetupOpts = {}) {
  renderWithProviders(
    <RunInfo status="failed" message={message} endTime={endTime} />,
  );
}

describe("RunInfo", () => {
  it("should show the error message when there is a date", async () => {
    const message = "Test error with end time";
    const endTime = new Date("2023-10-15T14:30:00");
    setup({ message, endTime });

    const button = screen.getByLabelText("See error");
    await userEvent.click(button);

    expect(
      screen.getByText("Failed at Oct 15, 2023 2:30 PM, with this error"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(message)).toBeInTheDocument();
  });

  it("should show the error message when there is no date", async () => {
    const message = "Test error occurred";
    setup({ message });

    const button = screen.getByLabelText("See error");
    await userEvent.click(button);

    expect(screen.getByText("Failed with this error")).toBeInTheDocument();
    expect(screen.getByDisplayValue(message)).toBeInTheDocument();
  });
});
