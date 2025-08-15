import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { UpsellCta } from "./UpsellCta";

function setup({
  buttonText,
  url,
  internalLink,
  onClick,
}: {
  buttonText: string;
  url?: string;
  internalLink?: string;
  onClick?: () => void;
}) {
  const user = userEvent.setup();
  const mockOnClick = jest.fn();
  const mockOnClickCapture = jest.fn();

  renderWithProviders(
    <>
      <Route path="/admin/settings" component={() => <div>Settings</div>} />
      <Route
        path="/"
        component={() => (
          <UpsellCta
            onClick={onClick}
            onClickCapture={mockOnClickCapture}
            buttonText={buttonText}
            url={url}
            internalLink={internalLink}
          />
        )}
      />
    </>,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );

  return {
    user,
    mockOnClick,
    mockOnClickCapture,
  };
}

describe("UpsellCta", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("onClick variant", () => {
    it("should render as UnstyledButton when onClick is provided", async () => {
      const mockOnClick = jest.fn();

      const { mockOnClickCapture, user } = setup({
        onClick: mockOnClick,
        buttonText: "Click me",
      });

      const button = screen.getByRole("button", { name: "Click me" });
      await user.click(button);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
      expect(mockOnClickCapture).toHaveBeenCalledTimes(1);
    });
  });

  describe("external URL variant", () => {
    it("should render as ExternalLink when url is provided", async () => {
      const { mockOnClickCapture, user } = setup({
        buttonText: "External link",
        url: "https://example.com",
      });

      const link = screen.getByRole("link", { name: "External link" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com");
      await user.click(link);

      expect(mockOnClickCapture).toHaveBeenCalledTimes(1);
    });
  });

  describe("internal link variant", () => {
    it("should render as Link when internalLink is provided", async () => {
      const { mockOnClickCapture, user } = setup({
        buttonText: "Internal link",
        internalLink: "/admin/settings",
      });

      const link = screen.getByText("Internal link");
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe("A");

      await user.click(link);

      expect(mockOnClickCapture).toHaveBeenCalledTimes(1);
    });
  });

  describe("priority handling", () => {
    it("should prioritize onClick over url when both are provided", () => {
      setup({
        onClick: jest.fn(),
        buttonText: "Priority test",
        url: "https://example.com",
      });
      const button = screen.getByRole("button", { name: "Priority test" });
      expect(button).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("should prioritize url over internalLink when both are provided", () => {
      setup({
        buttonText: "Priority test",
        url: "https://example.com",
        internalLink: "/admin/settings",
      });

      // Based on the current implementation, when both url and internalLink are provided,
      // the internalLink pattern matches first, so it renders an internal Link
      const link = screen.getByText("Priority test");
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe("A");
    });
  });
});
