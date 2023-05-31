import React from "react";
import { screen } from "@testing-library/react";
import { createMockPopularItem } from "metabase-types/api/mocks";
import { renderWithProviders, waitForElementToBeRemoved } from "__support__/ui";
import { setupPopularItemsEndpoints } from "__support__/server-mocks";
import { PopularItem } from "metabase-types/api";
import { HomePopularSection } from "./HomePopularSection";

interface SetupOpts {
  popularItems: PopularItem[];
}

const setup = async ({ popularItems }: SetupOpts) => {
  setupPopularItemsEndpoints(popularItems);
  renderWithProviders(<HomePopularSection />);
  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));
};

describe("HomePopularSection", () => {
  it("should render a list of items of the same type", async () => {
    await setup({
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

    expect(screen.getByText(/popular dashboards/)).toBeInTheDocument();
  });

  it("should render a list of items of different types", async () => {
    await setup({
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

    expect(screen.getByText(/popular items/)).toBeInTheDocument();
  });
});
