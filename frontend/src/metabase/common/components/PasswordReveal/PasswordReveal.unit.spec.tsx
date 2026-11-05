import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { PasswordReveal } from "metabase/common/components/PasswordReveal";

describe("password reveal", () => {
  it("masks the temporary password", () => {
    renderWithProviders(<PasswordReveal password="password" />);

    expect(screen.getByLabelText("Temporary password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("reveals the temporary password when clicking the eye icon", async () => {
    renderWithProviders(<PasswordReveal password="password" />);

    const input = screen.getByLabelText("Temporary password");
    const toggle = screen.getByLabelText("Toggle password visibility");

    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "password");
  });

  it("renders a copy button", () => {
    renderWithProviders(<PasswordReveal password="password" />);
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
  });
});
