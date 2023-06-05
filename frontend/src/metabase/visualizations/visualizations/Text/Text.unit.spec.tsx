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

const setup = (options = {}) => {
  render(<Text {...defaultProps} {...options} />);
};

describe("Text", () => {
  it("should render plain text", () => {
    const options = {
      settings: getSettingsWithText("Plain text"),
    };
    setup(options);

    expect(screen.getByText("Plain text")).toBeInTheDocument();
  });

  it("should render simple markdown", () => {
    const options = {
      settings: getSettingsWithText("**Bold text**"),
    };
    setup(options);

    expect(screen.getByText("Bold text")).toHaveStyle("font-weight: bold");
  });

  it("should render an internal link", () => {
    const options = {
      settings: getSettingsWithText("[Internal link](/)"),
    };
    setup(options);

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
    const options = {
      settings: getSettingsWithText("[External link](https://example.com)"),
    };
    setup(options);

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
