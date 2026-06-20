import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { PasswordReveal } from "metabase/common/components/PasswordReveal";

describe("password reveal", () => {
  it("masks the password and reveals it when the toggle is clicked", () => {
    renderWithProviders(<PasswordReveal password="password" />);

    const input = screen.getByLabelText("Temporary password");
    expect(input).toHaveAttribute("type", "password");

    // Mantine's PasswordInput toggle fires on mousedown, not click
    fireEvent.mouseDown(screen.getByLabelText("Show password"));

    expect(input).toHaveAttribute("type", "text");
  });

  it("renders a copy button", () => {
    renderWithProviders(<PasswordReveal password="password" />);
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
  });
});
