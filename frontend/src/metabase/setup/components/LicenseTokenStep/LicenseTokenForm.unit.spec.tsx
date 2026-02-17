import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { LicenseTokenForm } from "./LicenseTokenForm";

function setup(args: { initialValue?: string } = {}) {
  const { initialValue } = args;
  const onSubmit = jest.fn();
  const onSkip = jest.fn();

  renderWithProviders(
    <LicenseTokenForm
      onSubmit={onSubmit}
      onSkip={onSkip}
      initialValue={initialValue}
    />,
  );

  return {
    onSubmit,
    onSkip,
  };
}

describe("LicenseTokenForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form with initial empty value", () => {
    setup();

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
      initialValue: "test-token",
    });

    expect(screen.getByDisplayValue("test-token")).toBeInTheDocument();
  });

  it("trims whitespace from token input", async () => {
    setup();

    const input = screen.getByPlaceholderText("Paste your token here");
    await userEvent.type(input, "  test-token  ");

    expect(input).toHaveValue("test-token");
  });

  it("calls onSubmit with trimmed token value", async () => {
    const { onSubmit } = setup();

    const input = screen.getByPlaceholderText("Paste your token here");
    const token = Array(64).fill("1").join("");
    await userEvent.type(input, token);

    const submitButton = screen.getByRole("button", { name: "Activate" });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(token);
    });
  });

  it("calls onSkip when skip link is clicked", async () => {
    const { onSkip } = setup();

    const skipLink = screen.getByText("I'll activate later");
    await userEvent.click(skipLink);

    expect(onSkip).toHaveBeenCalled();
  });

  it("shows info hover card on hover", async () => {
    setup();

    const infoIcon = screen.getByLabelText("Token details information");
    await userEvent.hover(infoIcon);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Find your license token in the subscription confirmation email from Metabase",
        ),
      ).toBeInTheDocument();
    });
  });

  it("disables submit button when token is invalid", async () => {
    setup();

    const input = screen.getByPlaceholderText("Paste your token here");
    await userEvent.type(input, "invalid-token");

    const submitButton = screen.getByRole("button", { name: "Activate" });
    expect(submitButton).toBeDisabled();
  });

  it("shows error message for invalid token", async () => {
    setup();
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
