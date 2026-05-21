import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { McpFeedbackButtons } from "./McpFeedbackButtons";

describe("McpFeedbackButtons", () => {
  it("notifies when a feedback choice is selected", async () => {
    const user = userEvent.setup();
    const onSelectFeedback = jest.fn();

    renderWithProviders(
      <McpFeedbackButtons
        isSubmitting={false}
        submittedFeedback={null}
        onSelectFeedback={onSelectFeedback}
      />,
    );

    await user.click(screen.getByTestId("mcp-feedback-thumbs-up"));
    await user.click(screen.getByTestId("mcp-feedback-thumbs-down"));

    expect(onSelectFeedback).toHaveBeenCalledTimes(2);
    expect(onSelectFeedback).toHaveBeenNthCalledWith(1, "positive");
    expect(onSelectFeedback).toHaveBeenNthCalledWith(2, "negative");
  });

  it("disables feedback choices while feedback is submitting", () => {
    renderWithProviders(
      <McpFeedbackButtons
        isSubmitting
        submittedFeedback={null}
        onSelectFeedback={jest.fn()}
      />,
    );

    expect(screen.getByTestId("mcp-feedback-thumbs-up")).toBeDisabled();
    expect(screen.getByTestId("mcp-feedback-thumbs-down")).toBeDisabled();
  });
});
