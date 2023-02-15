import React from "react";
import { renderWithProviders, screen, fireEvent } from "__support__/ui";

import { createMockDashboardCardWithVirtualCard } from "metabase-types/api/mocks";

import LinkViz, { LinkVizProps } from "./LinkViz";
import type { LinkCardSettings } from "./LinkVizSettings";

const linkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      url: "https://example23.com",
    },
    virtual_card: {
      display: "link",
    },
  },
});

const emptyLinkDashcard = createMockDashboardCardWithVirtualCard({
  visualization_settings: {
    link: {
      url: "",
    },
    virtual_card: {
      display: "link",
    },
  },
});

const setup = (options?: Partial<LinkVizProps>) => {
  const changeSpy = jest.fn();

  renderWithProviders(
    <LinkViz
      dashcard={linkDashcard}
      isEditing={true}
      isPreviewing={false}
      isSettings={false}
      onUpdateVisualizationSettings={changeSpy}
      settings={
        linkDashcard.visualization_settings as unknown as LinkCardSettings
      }
      {...options}
    />,
  );

  return { changeSpy };
};

describe("LinkViz", () => {
  it("should render link input settings view", () => {
    setup({ isEditing: true });

    expect(screen.getByPlaceholderText("https://example.com")).toHaveValue(
      "https://example23.com",
    );
  });

  it("updates visualization settings with input value", () => {
    const { changeSpy } = setup({ isEditing: true });

    const linkInput = screen.getByPlaceholderText("https://example.com");
    fireEvent.change(linkInput, {
      target: { value: "https://example.com/123" },
    });

    expect(changeSpy).toHaveBeenCalledWith({
      link: {
        url: "https://example.com/123",
      },
    });
  });

  it("should render link display view", () => {
    setup({ isEditing: false });

    expect(screen.getByLabelText("link icon")).toBeInTheDocument();
    expect(screen.getByText("https://example23.com")).toBeInTheDocument();
  });

  it("should render empty state", () => {
    setup({
      isEditing: false,
      dashcard: emptyLinkDashcard,
      settings:
        emptyLinkDashcard.visualization_settings as unknown as LinkCardSettings,
    });

    expect(screen.queryByLabelText("link icon")).not.toBeInTheDocument();
    expect(screen.getByLabelText("question icon")).toBeInTheDocument();

    expect(screen.getByText("Choose a link")).toBeInTheDocument();
  });
});
