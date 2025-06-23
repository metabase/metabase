import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { LicenseTokenForm } from "./LicenseTokenForm";

const mockOnSubmit = jest.fn();
const mockOnSkip = jest.fn();

function setup({
  onSubmit = mockOnSubmit,
  onSkip = mockOnSkip,
  initialValue = "",
}: {
  onSubmit: (token: string) => Promise<void>;
  onSkip: () => void;
  initialValue?: string;
}) {
  renderWithProviders(
    <LicenseTokenForm
      onSubmit={onSubmit}
      onSkip={onSkip}
      initialValue={initialValue}
    />,
  );
}

describe("LicenseTokenForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form with initial empty value", () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });

    expect(
      screen.getByPlaceholderText("Paste your token here"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Activate" }),
    ).toBeInTheDocument();
    expect(screen.getByText("I'll activate later")).toBeInTheDocument();
  });

  it("renders the form with initial value", () => {
    setup({
      onSubmit: mockOnSubmit,
      onSkip: mockOnSkip,
      initialValue: "test-token",
    });

    expect(screen.getByDisplayValue("test-token")).toBeInTheDocument();
  });

  it("trims whitespace from token input", async () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });

    const input = screen.getByPlaceholderText("Paste your token here");
    await userEvent.type(input, "  test-token  ");

    expect(input).toHaveValue("test-token");
  });

  it("calls onSubmit with trimmed token value", async () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });

    const input = screen.getByPlaceholderText("Paste your token here");
    const token = Array(64).fill("1").join("");
    await userEvent.type(input, token);

    const submitButton = screen.getByRole("button", { name: "Activate" });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(token);
    });
  });

  it("calls onSkip when skip link is clicked", async () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });

    const skipLink = screen.getByText("I'll activate later");
    await userEvent.click(skipLink);

    expect(mockOnSkip).toHaveBeenCalled();
  });

  it("shows info popover on hover", async () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });

    const infoIcon = screen.getByLabelText("Token details information");
    userEvent.hover(infoIcon);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Find your license token in the subscription confirmation email from Metabase",
        ),
      ).toBeInTheDocument();
    });
  });

  it("disables submit button when token is invalid", async () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });

    const input = screen.getByPlaceholderText("Paste your token here");
    await userEvent.type(input, "invalid-token");

    const submitButton = screen.getByRole("button", { name: "Activate" });
    expect(submitButton).toBeDisabled();
  });

  it("shows error message for invalid token", async () => {
    setup({ onSubmit: mockOnSubmit, onSkip: mockOnSkip });
    const user = userEvent.setup();

    const input = screen.getByPlaceholderText("Paste your token here");
    await userEvent.type(input, "invalid-token");
    // we should see error message when input loses focus
    await user.tab();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
