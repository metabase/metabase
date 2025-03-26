import userEvent from "@testing-library/user-event";

import { setupSearchEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockModelResult } from "metabase/browse/models/test-utils";
import type { SearchResult } from "metabase-types/api";

import { SimpleDataPicker } from "./SimpleDataPicker";

const SEARCH_RESULTS = [
  createMockModelResult({
    id: 2,
    name: "Reviews",
  }),
  createMockModelResult({
    id: 1,
    name: "Orders",
  }),
  createMockModelResult({
    id: 0,
    name: "Products",
  }),
];

interface SetupOpts {
  searchResults: SearchResult[];
}
function setup(opts?: SetupOpts) {
  setupSearchEndpoints(opts?.searchResults ?? SEARCH_RESULTS);

  const onClick = jest.fn();
  renderWithProviders(
    <SimpleDataPicker
      entityTypes={["model", "table"]}
      isInitiallyOpen={true}
      setSourceTableFn={onClick}
      filterByDatabaseId={null}
      triggerElement={<div>data picker trigger</div>}
    />,
  );

  return { onClick };
}

describe("SimpleDataPicker", () => {
  it("should render", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: "Products" }),
    ).toBeInTheDocument();
  });

  it('should order the results by "name" in ascending order', async () => {
    const searchResults = [
      createMockModelResult({
        id: 2,
        name: "Reviews",
      }),
      createMockModelResult({
        id: 1,
        name: "Orders",
      }),
      createMockModelResult({
        id: 0,
        // Deliberate lower-case name to test sorting
        name: "products",
      }),
    ];

    setup({
      searchResults,
    });
    expect(
      await screen.findByRole("link", { name: "products" }),
    ).toBeInTheDocument();
    const dataSources = screen.getAllByRole("link");
    expect(dataSources).toHaveLength(3);
    expect(dataSources[0]).toHaveTextContent("Orders");
    expect(dataSources[1]).toHaveTextContent("products");
    expect(dataSources[2]).toHaveTextContent("Reviews");
  });

  it('should order the results by "name" preserving the order when the names equal', async () => {
    const searchResults = [
      createMockModelResult({
        id: 3,
        name: "Reviews",
      }),
      createMockModelResult({
        id: 2,
        name: "Orders",
      }),
      createMockModelResult({
        id: 1,
        name: "Orders",
      }),
      createMockModelResult({
        id: 0,
        name: "Products",
      }),
    ];

    const { onClick } = setup({
      searchResults,
    });
    expect(
      await screen.findByRole("link", { name: "Products" }),
    ).toBeInTheDocument();
    const dataSources = screen.getAllByRole("link");
    expect(dataSources).toHaveLength(4);
    expect(dataSources[0]).toHaveTextContent("Orders");
    expect(dataSources[1]).toHaveTextContent("Orders");
    expect(dataSources[2]).toHaveTextContent("Products");
    expect(dataSources[3]).toHaveTextContent("Reviews");

    /**
     * Since ID 1 and 2 have the same name, the result should be the ID that comes
     * in the search results first. Which is ID 2 since I return newer items (greater ID) first.
     *
     * We don't need to click the other `Orders` because we can infer from the other order
     * data source that it's the one with ID 1.
     */
    await userEvent.click(dataSources[0]);
    expect(onClick).toHaveBeenCalledWith("card__2");
  });
});
