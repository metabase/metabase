import React from "react";

import { render, screen } from "@testing-library/react";
import { Text } from "../Text";

// ! FIX TYPESCRIPT ERRORS
interface Settings {
  text: string | null;
}

describe("Text", () => {
  it("should be able to render", () => {
    expect(() =>
      render(<Text settings={getSettingsWithText(null)} />),
    ).not.toThrow();
  });

  it("should render plain text", () => {
    render(<Text settings={getSettingsWithText("Plain text")} />);

    expect(screen.getByText("Plain text")).toBeInTheDocument();
  });

  it("should render simple markdown", () => {
    render(<Text settings={getSettingsWithText("**Bold text**")} />);

    expect(screen.getByText("Bold text")).toHaveStyle("font-weight: bold");
  });

  it("should render an internal link", () => {
    render(<Text settings={getSettingsWithText("[Internal link](/)")} />);

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
