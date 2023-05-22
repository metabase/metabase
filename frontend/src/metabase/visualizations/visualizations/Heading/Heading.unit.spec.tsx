import React from "react";

import { render, screen } from "@testing-library/react";
import { Heading } from "../Heading";

interface Settings {
  text: string;
}

const defaultProps = {
  onUpdateVisualizationSettings: ({ text }: { text: string }) => {
    return;
  },
  dashcard: {},
  settings: { text: "" },
  isEditing: false,
};

describe("Text", () => {
  it("should be able to render", () => {
    expect(() =>
      render(<Heading {...defaultProps} settings={getSettingsWithText("")} />),
    ).not.toThrow();
  });

  it("should render text", () => {
    render(
      <Heading
        {...defaultProps}
        settings={getSettingsWithText("Plain text")}
      />,
    );

    expect(screen.getByText("Plain text")).toBeInTheDocument();
  });
});

function getSettingsWithText(text: string): Settings {
  return {
    text,
  };
}
