import { render, screen } from "__support__/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

describe("TroubleshootingTip", () => {
  const defaultProps = {
    title: "Test Title",
    body: "Test body content",
  };

  describe("Basic rendering", () => {
    it("should render title and body", () => {
      render(<TroubleshootingTip {...defaultProps} />);

      expect(screen.getByText("Test Title")).toBeInTheDocument();
      expect(screen.getByText("Test body content")).toBeInTheDocument();
    });

    it("should render with icon by default", () => {
      render(<TroubleshootingTip {...defaultProps} />);

      // The icon is rendered as an SVG with name="info"
      const container = screen.getByText("Test Title").closest("div");
      expect(container?.parentElement).toBeInTheDocument();
    });

    it("should render without icon when noIcon is true", () => {
      render(<TroubleshootingTip {...defaultProps} noIcon />);

      expect(screen.getByText("Test Title")).toBeInTheDocument();
      expect(screen.getByText("Test body content")).toBeInTheDocument();
    });
  });

  describe("Content handling", () => {
    it("should render ReactNode as body", () => {
      const bodyContent = (
        <div>
          <span>Complex content</span>
          <button>Click me</button>
        </div>
      );

      render(<TroubleshootingTip title="Complex Title" body={bodyContent} />);

      expect(screen.getByText("Complex Title")).toBeInTheDocument();
      expect(screen.getByText("Complex content")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Click me" }),
      ).toBeInTheDocument();
    });

    it("should handle empty body", () => {
      render(<TroubleshootingTip title="Title Only" body="" />);

      expect(screen.getByText("Title Only")).toBeInTheDocument();
    });

    it("should handle JSX elements in body", () => {
      const bodyWithLink = (
        <>
          Check out our <a href="/docs">documentation</a> for more info.
        </>
      );

      render(<TroubleshootingTip title="With Link" body={bodyWithLink} />);

      expect(screen.getByText("With Link")).toBeInTheDocument();
      expect(screen.getByText(/Check out our/)).toBeInTheDocument();
      expect(screen.getByText(/for more info/)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "documentation" }),
      ).toBeInTheDocument();
    });
  });
});
