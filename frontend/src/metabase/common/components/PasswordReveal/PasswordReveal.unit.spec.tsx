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

  it("renders a copy button", () => {
    renderWithProviders(<PasswordReveal password="password" />);
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
  });
});
