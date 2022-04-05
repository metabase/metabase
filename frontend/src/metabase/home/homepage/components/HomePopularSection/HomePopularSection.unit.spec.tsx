import React from "react";
import { render, screen } from "@testing-library/react";
import HomePopularSection, {
  HomePopularSectionProps,
} from "./HomePopularSection";
import { createMockPopularItem } from "metabase-types/api/mocks";

describe("HomePopularSection", () => {
  it("should render a list of items of the same type", () => {
    const props = getProps({
      popularItems: [
        createMockPopularItem({
          model: "dashboard",
          model_object: {
            name: "Metrics",
          },
        }),
        createMockPopularItem({
          model: "dashboard",
          model_object: {
            name: "Revenue",
          },
        }),
      ],
    });

    render(<HomePopularSection {...props} />);

    expect(
      screen.getByText("Here are some popular dashboards"),
    ).toBeInTheDocument();
    expect(screen.getByText(""));
  });

  it("should render a list of items of different types", () => {
    const props = getProps({
      popularItems: [
        createMockPopularItem({
          model: "dashboard",
          model_object: {
            name: "Metrics",
          },
        }),
        createMockPopularItem({
          model: "card",
          model_object: {
            name: "Revenue",
          },
        }),
      ],
    });

    render(<HomePopularSection {...props} />);

    expect(screen.getByText("Here are some popular items")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<HomePopularSectionProps>,
): HomePopularSectionProps => ({
  popularItems: [],
  ...opts,
});
