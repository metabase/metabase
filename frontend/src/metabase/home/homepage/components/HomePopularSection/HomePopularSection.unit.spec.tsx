import React from "react";
import { screen } from "@testing-library/react";
import { createMockPopularItem } from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";
import { setupPopularItemsEndpoints } from "__support__/server-mocks";
import { PopularItem } from "metabase-types/api";
import HomePopularSection from "./HomePopularSection";

const setup = (items: PopularItem[]) => {
  setupPopularItemsEndpoints(items);
  renderWithProviders(<HomePopularSection />);
};

describe("HomePopularSection", () => {
  it("should render a list of items of the same type", async () => {
    setup([
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
    ]);

    expect(await screen.findByText(/popular dashboards/)).toBeInTheDocument();
  });

  it("should render a list of items of different types", async () => {
    setup([
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
    ]);

    expect(await screen.findByText(/popular items/)).toBeInTheDocument();
  });
});
