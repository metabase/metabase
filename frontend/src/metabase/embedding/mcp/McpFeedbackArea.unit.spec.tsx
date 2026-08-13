import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { McpFeedbackArea } from "./McpFeedbackArea";

describe("McpFeedbackArea", () => {
  it("submits negative feedback details", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    renderWithProviders(
      <McpFeedbackArea
        feedback="negative"
        isSubmitting={false}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Any additional thoughts?"),
      "Needs a better chart",
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(onSubmit.mock.calls[0][0]).toEqual({
      issue_type: "",
      freeform_feedback: "Needs a better chart",
    });
  });

  it("cancels feedback entry", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    renderWithProviders(
      <McpFeedbackArea
        feedback="positive"
        isSubmitting={false}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
