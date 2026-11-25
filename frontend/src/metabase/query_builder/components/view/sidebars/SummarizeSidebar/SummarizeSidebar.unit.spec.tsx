import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersDiscountDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersSubtotalDatasetColumn,
  createOrdersTaxDatasetColumn,
  createOrdersTotalDatasetColumn,
  createOrdersUserIdDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { SummarizeSidebar } from "./SummarizeSidebar";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

type SetupOpts = {
  query?: Lib.Query;
  withDefaultAggregation?: boolean;
};

function createSummarizedQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          {
            type: "operator",
            operator: "max",
            args: [{ type: "column", name: "QUANTITY" }],
          },
        ],
        breakouts: [
          {
            type: "column",
            name: "CREATED_AT",
            unit: "month",
          },
          {
            type: "column",
            sourceFieldId: ORDERS.PRODUCT_ID,
            name: "CATEGORY",
          },
        ],
      },
    ],
  });
}

function createQueryWithBreakoutsForSameColumn() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [
          {
            type: "column",
            name: "CREATED_AT",
            unit: "year",
          },
          {
            type: "column",
            name: "CREATED_AT",
            unit: "quarter",
          },
        ],
      },
    ],
  });
}

async function setup({
  query: initialQuery = Lib.createTestQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  ),
  withDefaultAggregation = true,
}: SetupOpts = {}) {
  const onQueryChange = jest.fn();
  const onClose = jest.fn();

  setupDatabaseEndpoints(createSampleDatabase());

  function Wrapper() {
    const [query, setQuery] = useState(initialQuery);

    return (
      <SummarizeSidebar
        query={query}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          onQueryChange(nextQuery);
        }}
        onClose={onClose}
        stageIndex={-1}
      />
    );
  }

  renderWithProviders(<Wrapper />, {
    storeInitialState: createMockState({
      qb: createMockQueryBuilderState({
        card: createMockCard(),
      }),
    }),
  });

  if (!withDefaultAggregation) {
    const countButton = screen.getByLabelText("Count");
    await userEvent.click(within(countButton).getByLabelText("close icon"));
  }

  function getNextQuery() {
    const [lastCall] = onQueryChange.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getNextAggregations() {
    const query = getNextQuery();
    return Lib.aggregations(query, -1).map((aggregation) =>
      Lib.displayInfo(query, -1, aggregation),
    );
  }

  function getNextBreakouts() {
    const query = getNextQuery();
    return Lib.breakouts(query, -1).map((breakout) =>
      Lib.displayInfo(query, -1, breakout),
    );
  }

  return {
    getNextAggregations,
    getNextBreakouts,
    onQueryChange,
    onClose,
  };
}

describe("SummarizeSidebar", () => {
  describe("default aggregation", () => {
    it("should apply default aggregation for bare rows query", async () => {
      const { getNextAggregations, onQueryChange } = await setup();

      expect(screen.getByLabelText("Count")).toBeInTheDocument();
      await userEvent.click(screen.getByText("Done"));

      const aggregations = getNextAggregations();
      const [aggregation] = aggregations;
      expect(aggregations).toHaveLength(1);
      expect(aggregation.displayName).toBe("Count");
      expect(onQueryChange).toHaveBeenCalledTimes(1);
    });

    it("should allow to remove the default aggregation without triggering a query update", async () => {
      const { onQueryChange } = await setup();

      const countButton = screen.getByLabelText("Count");
      await userEvent.click(within(countButton).getByLabelText("close icon"));

      expect(screen.queryByLabelText("Count")).not.toBeInTheDocument();
      expect(onQueryChange).not.toHaveBeenCalled();
    });

    it("should allow to remove last not default aggregation (metabase#48033)", async () => {
      await setup({
        query: Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
            },
          ],
        }),
      });

      const countButton = screen.getByLabelText("Count");
      await userEvent.click(within(countButton).getByLabelText("close icon"));

      expect(screen.queryByLabelText("Count")).not.toBeInTheDocument();
    });

    it("should allow to add the default aggregation manually after it was removed", async () => {
      const { getNextAggregations, onQueryChange } = await setup();

      const countButton = screen.getByLabelText("Count");
      await userEvent.click(within(countButton).getByLabelText("close icon"));
      await userEvent.click(screen.getByText("Add a function or metric"));
      await userEvent.click(await screen.findByText("Count of rows"));

      const aggregations = getNextAggregations();
      const [aggregation] = aggregations;
      expect(aggregations).toHaveLength(1);
      expect(aggregation.displayName).toBe("Count");
      expect(onQueryChange).toHaveBeenCalledTimes(1);
    });

    it("shouldn't apply default aggregation if a query is already aggregated", async () => {
      await setup({ query: createSummarizedQuery() });
      expect(screen.queryByLabelText("Count")).not.toBeInTheDocument();
    });
  });

  it("should list breakoutable columns", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const columns = Lib.breakoutableColumns(query, -1);
    await setup({ query });

    expect(screen.getByText("Group by")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getAllByTestId("dimension-list-item")).toHaveLength(
      columns.length,
    );
  });

  it("should list render the info icon on breakout columns", async () => {
    await setup();
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("shouldn't list breakout columns without an aggregation", async () => {
    await setup({ withDefaultAggregation: false });

    expect(screen.queryByText("Group by")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("dimension-list-item").length).toBe(0);
  });

  it("should allow searching breakout columns", async () => {
    await setup();

    const searchInput = screen.getByPlaceholderText(/Find/);
    await userEvent.type(searchInput, "Created");

    await waitFor(() =>
      expect(screen.getAllByTestId("dimension-list-item")).toHaveLength(3),
    );
    expect(screen.getAllByLabelText("Created At")).toHaveLength(3);
  });

  it("should highlight selected breakout columns", async () => {
    await setup({ query: createSummarizedQuery() });

    const [ordersCreatedAt, peopleCreatedAt] =
      screen.getAllByLabelText("Created At");
    const productCategory = screen.getByLabelText("Product → Category");

    expect(ordersCreatedAt).toHaveAttribute("aria-selected", "true");
    expect(productCategory).toHaveAttribute("aria-selected", "true");
    expect(peopleCreatedAt).toHaveAttribute("aria-selected", "false");
  });

  it("should list breakouts added before opening the sidebar in a separate section", async () => {
    await setup({ query: createSummarizedQuery() });

    expect(
      within(getPinnedColumnList()).getByText("Product → Category"),
    ).toBeInTheDocument();
    expect(
      within(getPinnedColumnList()).getByText("Created At"),
    ).toBeInTheDocument();

    expect(
      within(getUnpinnedColumnList()).queryByText("Category"),
    ).not.toBeInTheDocument();

    // "Product → Created At" and "User → Created At" should still be there
    expect(
      within(getUnpinnedColumnList()).getAllByText("Created At"),
    ).toHaveLength(2);
  });

  it("should not show the binning in the name of a pinned binned breakout (metabase#57697)", async () => {
    await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [
              { type: "column", name: "CATEGORY" },
              {
                type: "column",
                name: "PRICE",
                binning: { strategy: "default" },
              },
            ],
          },
        ],
      }),
    });

    const pinnedColumnList = getPinnedColumnList();
    expect(screen.queryByText("Price: Auto binned")).not.toBeInTheDocument();
    expect(within(pinnedColumnList).getByText("Category")).toBeInTheDocument();
    expect(within(pinnedColumnList).getByText("Price")).toBeInTheDocument();
  });

  it("should show multiple breakouts of the same column", async () => {
    await setup({
      query: createQueryWithBreakoutsForSameColumn(),
    });
    expect(
      within(getPinnedColumnList()).getAllByText("Created At"),
    ).toHaveLength(2);
  });

  it("should allow to modify temporal buckets for breakouts of the same column", async () => {
    const { getNextBreakouts } = await setup({
      query: createQueryWithBreakoutsForSameColumn(),
    });

    await userEvent.click(await screen.findByText("by year"));
    await userEvent.click(await screen.findByText("Day"));
    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Created At: Day" },
      { displayName: "Created At: Quarter" },
    ]);

    await userEvent.click(await screen.findByText("by quarter"));
    await userEvent.click(await screen.findByText("Month"));
    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Created At: Day" },
      { displayName: "Created At: Month" },
    ]);
  });

  it("should ignore attempts to create duplicate breakouts by changing the temporal bucket for one of the breakouts", async () => {
    const { getNextBreakouts } = await setup({
      query: createQueryWithBreakoutsForSameColumn(),
    });

    await userEvent.click(await screen.findByText("by year"));
    await userEvent.click(await screen.findByText("Quarter"));
    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Created At: Year" },
      { displayName: "Created At: Quarter" },
    ]);
  });

  it("should allow to remove breakouts of the same column", async () => {
    const { getNextBreakouts } = await setup({
      query: createQueryWithBreakoutsForSameColumn(),
    });

    const [firstBreakout] = within(getPinnedColumnList()).getAllByLabelText(
      "Created At",
    );
    await userEvent.click(
      within(firstBreakout).getByLabelText("Remove dimension"),
    );
    expect(
      within(getPinnedColumnList()).getByText("Created At"),
    ).toBeInTheDocument();
    expect(
      within(getUnpinnedColumnList()).getAllByText("Created At"),
    ).toHaveLength(2);
    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Created At: Quarter" },
    ]);

    const [secondBreakout] = within(getPinnedColumnList()).getAllByLabelText(
      "Created At",
    );
    await userEvent.click(
      within(secondBreakout).getByLabelText("Remove dimension"),
    );
    expect(
      within(getPinnedColumnList()).queryByText("Created At"),
    ).not.toBeInTheDocument();
    expect(
      within(getUnpinnedColumnList()).getAllByText("Created At"),
    ).toHaveLength(3);
    expect(getNextBreakouts()).toEqual([]);
  });

  it("should pin breakouts of the query table by name and of other tables with the table, and return removed ones to the unpinned list", async () => {
    await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [
              {
                type: "column",
                name: "TOTAL",
                binning: { strategy: "default" },
              },
              { type: "column", name: "STATE", sourceFieldId: ORDERS.USER_ID },
            ],
          },
        ],
      }),
    });

    const pinnedTotal = within(getPinnedColumnList()).getByLabelText("Total");
    expect(pinnedTotal).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Orders → Total")).not.toBeInTheDocument();
    expect(
      within(getPinnedColumnList()).getByLabelText("User → State"),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(getUnpinnedColumnList()).queryByText("Total"),
    ).not.toBeInTheDocument();
    expect(
      within(getUnpinnedColumnList()).queryByText("State"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(pinnedTotal).getByLabelText("Remove dimension"),
    );
    expect(
      within(getPinnedColumnList()).queryByText("Total"),
    ).not.toBeInTheDocument();
    expect(
      within(getUnpinnedColumnList()).getByLabelText("Total"),
    ).toHaveAttribute("aria-selected", "false");

    await userEvent.click(
      within(
        within(getPinnedColumnList()).getByLabelText("User → State"),
      ).getByLabelText("Remove dimension"),
    );
    expect(screen.queryByText("User → State")).not.toBeInTheDocument();
    expect(
      within(getUnpinnedColumnList()).getByLabelText("State"),
    ).toHaveAttribute("aria-selected", "false");

    await userEvent.click(
      within(screen.getByTestId("aggregation-item")).getByLabelText(
        "close icon",
      ),
    );
    expect(screen.getByTestId("add-aggregation-button")).toHaveTextContent(
      "Add a function or metric",
    );
  });

  it("should add a breakout instead of replacing the others when picking a binning for a column", async () => {
    const { getNextBreakouts } = await setup();

    await userEvent.click(screen.getByText("Total"));
    await waitFor(() =>
      expect(getNextBreakouts()).toMatchObject([
        { displayName: "Total: Auto binned" },
      ]),
    );

    const quantity = screen.getByLabelText("Quantity");
    await userEvent.hover(quantity);
    await userEvent.click(within(quantity).getByLabelText("Binning strategy"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "10 bins" }),
    );

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(2));
    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Total: Auto binned" },
      { displayName: "Quantity: 10 bins" },
    ]);

    const total = screen.getByLabelText("Total");
    expect(total).toHaveAttribute("aria-selected", "true");
    expect(
      within(total).getByLabelText("Binning strategy"),
    ).toBeInTheDocument();
    const selectedQuantity = screen.getByLabelText("Quantity");
    expect(selectedQuantity).toHaveAttribute("aria-selected", "true");
    expect(
      within(selectedQuantity).getByLabelText("Binning strategy"),
    ).toBeInTheDocument();
    const discount = screen.getByLabelText("Discount");
    expect(discount).toHaveAttribute("aria-selected", "false");
    expect(
      within(discount).getByLabelText("Add dimension"),
    ).toBeInTheDocument();
    expect(
      within(discount).getByLabelText("Binning strategy"),
    ).toBeInTheDocument();
  });

  it.each([
    {
      title: "num-bins",
      tableId: ORDERS_ID,
      columnName: "TOTAL",
      displayName: "Total",
      binnings: [
        { strategy: "num-bins", numBins: 10 },
        { strategy: "num-bins", numBins: 50 },
      ] as const,
      bucket1Name: "100 bins",
      bucket2Name: "10 bins",
      expectedBreakouts: ["Total: 100 bins", "Total: 10 bins"],
    },
    {
      title: "bin-width",
      tableId: PEOPLE_ID,
      columnName: "LATITUDE",
      displayName: "Latitude",
      binnings: [
        { strategy: "bin-width", binWidth: 20 },
        { strategy: "bin-width", binWidth: 10 },
      ] as const,
      bucket1Name: "Bin every 1 degree",
      bucket2Name: "Bin every 0.1 degrees",
      expectedBreakouts: ["Latitude: 1°", "Latitude: 0.1°"],
    },
  ])(
    "should allow to modify $title binning for breakouts of the same column",
    async ({
      tableId,
      columnName,
      displayName,
      binnings,
      bucket1Name,
      bucket2Name,
      expectedBreakouts,
    }) => {
      const { getNextBreakouts } = await setup({
        query: Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: tableId },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
              breakouts: binnings.map((binning) => ({
                type: "column",
                name: columnName,
                binning,
              })),
            },
          ],
        }),
      });

      const [firstBreakout] = within(getPinnedColumnList()).getAllByLabelText(
        displayName,
      );
      await userEvent.click(
        within(firstBreakout).getByLabelText("Binning strategy"),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: bucket1Name }),
      );
      await waitFor(() =>
        expect(getNextBreakouts()).toMatchObject([
          { displayName: expectedBreakouts[0] },
          {},
        ]),
      );

      const [, secondBreakout] = within(
        getPinnedColumnList(),
      ).getAllByLabelText(displayName);
      await userEvent.click(
        within(secondBreakout).getByLabelText("Binning strategy"),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: bucket2Name }),
      );
      await waitFor(() =>
        expect(getNextBreakouts()).toMatchObject(
          expectedBreakouts.map((name) => ({ displayName: name })),
        ),
      );
      expect(getNextBreakouts()).toHaveLength(2);
      expect(
        within(getPinnedColumnList()).getAllByLabelText(displayName),
      ).toHaveLength(2);
    },
  );

  it("should add an aggregation", async () => {
    const { getNextAggregations } = await setup({
      withDefaultAggregation: false,
    });

    await userEvent.click(screen.getByLabelText("Add aggregation"));
    await userEvent.click(await screen.findByText("Average of ..."));
    await userEvent.click(await screen.findByText("Total"));

    await waitFor(() => {
      const [aggregation] = getNextAggregations();
      expect(aggregation.displayName).toBe("Average of Total");
    });
    expect(getNextAggregations()).toHaveLength(1);
  });

  it("should add a column-less aggregation", async () => {
    const { getNextAggregations } = await setup({
      withDefaultAggregation: false,
    });

    await userEvent.click(screen.getByLabelText("Add aggregation"));
    await userEvent.click(await screen.findByText("Count of rows"));

    await waitFor(() => {
      const [aggregation] = getNextAggregations();
      expect(aggregation.displayName).toBe("Count");
    });
    expect(getNextAggregations()).toHaveLength(1);
  });

  it("shouldn't allow adding an expression aggregation", async () => {
    await setup();

    await userEvent.click(screen.getByLabelText("Add aggregation"));

    expect(await screen.findByText("Total")).toBeInTheDocument();
    expect(screen.queryByText(/Custom Expression/i)).not.toBeInTheDocument();
  });

  it("shouldn't allow changing an aggregation to an expression", async () => {
    await setup({ query: createSummarizedQuery() });

    await userEvent.click(screen.getByText("Max of Quantity"));
    await userEvent.click(await screen.findByLabelText("Back"));

    expect(screen.queryByText(/Custom Expression/i)).not.toBeInTheDocument();
  });

  it("should add a breakout", async () => {
    const { getNextBreakouts } = await setup();

    await userEvent.click(screen.getByText("Category"));

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Category");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should add multiple breakouts", async () => {
    const { getNextBreakouts } = await setup();

    await userEvent.click(screen.getByText("Category"));
    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Category");
    });

    const breakoutOption = screen.getByLabelText("Quantity");
    await userEvent.hover(breakoutOption);
    await userEvent.click(
      within(breakoutOption).getByLabelText("Add dimension"),
    );

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(2));
    const [breakout1, breakout2] = getNextBreakouts();
    expect(breakout1.displayName).toBe("Category");
    expect(breakout2.displayName).toBe("Quantity: Auto binned");
  });

  it("should allow picking a temporal bucket for breakout columns", async () => {
    const { getNextBreakouts } = await setup();

    const [createdAt] = screen.getAllByLabelText("Created At");
    await userEvent.hover(createdAt);
    await userEvent.click(within(createdAt).getByText("by month"));
    const [quarter] = await screen.findAllByText("Quarter");
    await userEvent.click(quarter);

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Created At: Quarter");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should update the sort when changing the temporal bucket of a sorted breakout (metabase#16770)", async () => {
    const { onQueryChange } = await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
            orderBys: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      }),
    });

    const createdAt = within(getPinnedColumnList()).getByLabelText(
      "Created At",
    );
    await userEvent.click(within(createdAt).getByText("by month"));
    await userEvent.click(await screen.findByText("Year"));

    await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
    const [nextQuery] = onQueryChange.mock.lastCall;
    expect(
      Lib.breakouts(nextQuery, -1).map(
        (breakout) => Lib.displayInfo(nextQuery, -1, breakout).displayName,
      ),
    ).toEqual(["Created At: Year"]);
    expect(
      Lib.orderBys(nextQuery, -1).map(
        (orderBy) => Lib.displayInfo(nextQuery, -1, orderBy).displayName,
      ),
    ).toEqual(["Created At: Year"]);
  });

  it("should offer all temporal buckets for a column of a saved question source (metabase#10441, metabase#11439)", async () => {
    const card = createMockCard({
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      id: 2,
      name: "11439",
      result_metadata: [
        createOrdersIdDatasetColumn(),
        createOrdersUserIdDatasetColumn(),
        createOrdersProductIdDatasetColumn(),
        createOrdersSubtotalDatasetColumn(),
        createOrdersTaxDatasetColumn(),
        createOrdersTotalDatasetColumn(),
        createOrdersDiscountDatasetColumn(),
        createOrdersCreatedAtDatasetColumn(),
        createOrdersQuantityDatasetColumn(),
      ],
    });
    const provider = createMetadataProvider({
      metadata: createMockMetadata({
        databases: [createSampleDatabase()],
        questions: [card],
      }),
    });
    await setup({
      query: Lib.createTestQuery(provider, {
        stages: [{ source: { type: "card", id: card.id } }],
      }),
    });

    const [createdAt] = screen.getAllByLabelText("Created At");
    await userEvent.hover(createdAt);
    await userEvent.click(within(createdAt).getByText("by month"));
    await userEvent.click(await screen.findByText("More…"));

    expect(await screen.findByText("Hour of day")).toBeInTheDocument();
  });

  it("should allow picking a binning strategy for breakout columns", async () => {
    const { getNextBreakouts } = await setup();

    const [total] = screen.getAllByLabelText("Total");
    await userEvent.hover(total);
    await userEvent.click(within(total).getByText("Auto bin"));
    const [strategy] = await screen.findAllByText("10 bins");
    await userEvent.click(strategy);

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Total: 10 bins");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should add a new column instead of replacing when adding a bucketed column", async () => {
    const { getNextBreakouts } = await setup({
      query: createSummarizedQuery(),
    });

    const [total] = screen.getAllByLabelText("Total");
    await userEvent.hover(total);
    await userEvent.click(within(total).getByText("Auto bin"));
    const [strategy] = await screen.findAllByText("10 bins");
    await userEvent.click(strategy);

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(3));
  });

  it("should remove breakout", async () => {
    const { getNextBreakouts } = await setup({
      query: createSummarizedQuery(),
    });

    const [breakout] = screen.getAllByLabelText("Created At");
    await userEvent.click(within(breakout).getByLabelText("Remove dimension"));

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(1));
    expect(getNextBreakouts()[0].longDisplayName).toBe("Product → Category");
  });

  it("should replace breakouts by clicking on a column", async () => {
    const { getNextBreakouts } = await setup({
      query: createSummarizedQuery(),
    });

    await userEvent.click(screen.getByText("Quantity"));

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Quantity: Auto binned");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should close on 'Done' button", async () => {
    const { onClose } = await setup();
    await userEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });
});

function getPinnedColumnList() {
  return screen.getByTestId("pinned-dimensions");
}

function getUnpinnedColumnList() {
  return screen.getByTestId("unpinned-dimensions");
}
