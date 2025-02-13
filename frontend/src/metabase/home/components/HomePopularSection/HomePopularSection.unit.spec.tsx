import { screen } from "@testing-library/react";

import { setupPopularItemsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import type { PopularItem } from "metabase-types/api";
import { createMockPopularCollectionItem } from "metabase-types/api/mocks";

import { HomePopularSection } from "./HomePopularSection";

interface SetupOpts {
  popularItems: PopularItem[];
}

const samplePopularItems = [
  createMockPopularCollectionItem({
    model: "dashboard",
    name: "Metrics",
  }),
  createMockPopularCollectionItem({
    model: "dashboard",
    name: "Revenue",
  }),
  createMockPopularCollectionItem({
    model: "card",
    name: "Orders",
  }),
];
const setup = async ({ popularItems }: SetupOpts) => {
  setupPopularItemsEndpoints(popularItems);
  renderWithProviders(<HomePopularSection />);
  await waitForLoaderToBeRemoved();
};

describe("HomePopularSection", () => {
  it("should render a list of items of the same type", async () => {
    await setup({
      popularItems: samplePopularItems.slice(0, 2),
    });

    expect(screen.getByText(/popular dashboards/)).toBeInTheDocument();
  });

  it("should render a list of items of different types", async () => {
    await setup({
      popularItems: samplePopularItems,
    });

    expect(screen.getByText(/popular items/)).toBeInTheDocument();
  });
});
