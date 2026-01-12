import { render, screen } from "__support__/ui";

import { TroubleshootingTip } from "./TroubleshootingTip";

const defaultProps = {
  title: "Test Title",
  body: "Test body content",
};

describe("TroubleshootingTip", () => {
  describe("Basic rendering", () => {
    it("should render title and body", () => {
      render(<TroubleshootingTip {...defaultProps} />);

      expect(screen.getByText("Test Title")).toBeInTheDocument();
      expect(screen.getByText("Test body content")).toBeInTheDocument();
    });

    it("should render with icon by default", () => {
      render(<TroubleshootingTip {...defaultProps} />);
      expect(
        screen.getByRole("img", { name: "info icon" }),
      ).toBeInTheDocument();
    });

    it("should render without icon when noIcon is true", () => {
      render(<TroubleshootingTip {...defaultProps} noIcon />);
      expect(
        screen.queryByRole("img", { name: "info icon" }),
      ).not.toBeInTheDocument();
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
