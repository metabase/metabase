import { renderWithProviders, screen } from "__support__/ui";

import { AuthButton } from "./AuthButton";

interface SetupOpts {
  isCard?: boolean;
}

const setup = ({ isCard }: SetupOpts = {}) => {
  renderWithProviders(<AuthButton isCard={isCard}>Sign in</AuthButton>);
};

describe("AuthButton", () => {
  it("should render a card", () => {
    setup({ isCard: true });

    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("should render a link", () => {
    setup();

    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });
});
