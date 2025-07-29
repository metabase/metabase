import { render, screen } from "@testing-library/react";
import { t } from "ttag";

import { SlashCommandMenu } from "./SlashCommandMenu";

const mockOnInsertChart = jest.fn();
const mockOnAskMetabot = jest.fn();

describe("SlashCommandMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders both options", () => {
    render(
      <SlashCommandMenu
        onInsertChart={mockOnInsertChart}
        onAskMetabot={mockOnAskMetabot}
        selectedIndex={0}
        onKeyDown={() => {}}
      />,
    );

    expect(screen.getByText(t`Insert a chart`)).toBeInTheDocument();
    expect(screen.getByText(t`Ask metabot`)).toBeInTheDocument();
    expect(screen.getByText(t`Embed a question or visualization`)).toBeInTheDocument();
    expect(screen.getByText(t`Get AI assistance with your report`)).toBeInTheDocument();
  });

  it("calls onInsertChart when first option is clicked", () => {
    render(
      <SlashCommandMenu
        onInsertChart={mockOnInsertChart}
        onAskMetabot={mockOnAskMetabot}
        selectedIndex={0}
        onKeyDown={() => {}}
      />,
    );

    screen.getByText(t`Insert a chart`).click();
    expect(mockOnInsertChart).toHaveBeenCalledTimes(1);
    expect(mockOnAskMetabot).not.toHaveBeenCalled();
  });

  it("calls onAskMetabot when second option is clicked", () => {
    render(
      <SlashCommandMenu
        onInsertChart={mockOnInsertChart}
        onAskMetabot={mockOnAskMetabot}
        selectedIndex={0}
        onKeyDown={() => {}}
      />,
    );

    screen.getByText(t`Ask metabot`).click();
    expect(mockOnAskMetabot).toHaveBeenCalledTimes(1);
    expect(mockOnInsertChart).not.toHaveBeenCalled();
  });
});
