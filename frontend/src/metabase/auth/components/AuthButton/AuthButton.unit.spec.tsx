import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { AuthButton } from "./AuthButton";

interface SetupOpts {
  icon?: string;
  isCard?: boolean;
}

const setup = ({ icon, isCard }: SetupOpts = {}) => {
  renderWithProviders(
    <AuthButton icon={icon} isCard={isCard}>
      Sign in
    </AuthButton>,
  );
};

describe("AuthButton", () => {
  it("should render a card", () => {
    setup({ icon: "google", isCard: true });

    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByLabelText("google icon")).toBeInTheDocument();
  });

  it("should render a link", () => {
    setup();

    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });
});
