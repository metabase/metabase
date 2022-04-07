import React from "react";
import { render, screen } from "@testing-library/react";
import HomeRecentSection, { HomeRecentSectionProps } from "./HomeRecentSection";
import { createMockRecentItem } from "metabase-types/api/mocks";

describe("HomeRecentSection", () => {
  it("should render a list of recent items", () => {
    const props = getProps({
      recentItems: [
        createMockRecentItem({
          model: "table",
          model_object: {
            name: "Orders",
          },
        }),
      ],
    });

    render(<HomeRecentSection {...props} />);

    expect(screen.getByText("Pick up where you left off")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<HomeRecentSectionProps>,
): HomeRecentSectionProps => ({
  recentItems: [],
  ...opts,
});
