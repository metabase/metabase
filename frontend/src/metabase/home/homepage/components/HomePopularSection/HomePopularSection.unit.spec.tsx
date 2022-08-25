import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockPopularItem } from "metabase-types/api/mocks";
import HomePopularSection, {
  HomePopularSectionProps,
} from "./HomePopularSection";

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

    expect(screen.getByText(/popular dashboards/)).toBeInTheDocument();
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

    expect(screen.getByText(/popular items/)).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<HomePopularSectionProps>,
): HomePopularSectionProps => ({
  popularItems: [],
  ...opts,
});
