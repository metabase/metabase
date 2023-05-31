import { render, screen } from "@testing-library/react";
import { Text } from "../Text";

interface Settings {
  text: string | null;
}

const defaultProps = {
  onUpdateVisualizationSettings: null,
  className: null,
  dashboard: {},
  dashcard: {},
  gridSize: Text.defaultSize,
  settings: {},
  isEditing: false,
  parameterValues: {},
};

describe("Text", () => {
  it("should be able to render", () => {
    expect(() =>
      render(<Text {...defaultProps} settings={getSettingsWithText(null)} />),
    ).not.toThrow();
  });

  it("should render plain text", () => {
    render(
      <Text {...defaultProps} settings={getSettingsWithText("Plain text")} />,
    );

    expect(screen.getByText("Plain text")).toBeInTheDocument();
  });

  it("should render simple markdown", () => {
    render(
      <Text
        {...defaultProps}
        settings={getSettingsWithText("**Bold text**")}
      />,
    );

    expect(screen.getByText("Bold text")).toHaveStyle("font-weight: bold");
  });

  it("should render an internal link", () => {
    render(
      <Text
        {...defaultProps}
        settings={getSettingsWithText("[Internal link](/)")}
      />,
    );

    expect(screen.getByText("Internal link")).toHaveAttribute("href", "/");
    expect(screen.getByText("Internal link")).not.toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByText("Internal link")).not.toHaveAttribute(
      "rel",
      "noreferrer",
    );
  });

  it("should render an external link", () => {
    render(
      <Text
        {...defaultProps}
        settings={getSettingsWithText("[External link](https://example.com)")}
      />,
    );

    expect(screen.getByText("External link")).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByText("External link")).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByText("External link")).toHaveAttribute(
      "rel",
      "noreferrer",
    );
  });
});

function getSettingsWithText(text: string | null): Settings {
  return {
    text: text,
  };
}
