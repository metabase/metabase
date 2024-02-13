import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Card, UnsavedCard } from "metabase-types/api";
import {
  ORDERS,
  PRODUCTS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { SummarizeSidebar } from "./SummarizeSidebar";

type SetupOpts = {
  card?: Card | UnsavedCard;
  withDefaultAggregation?: boolean;
};

function createSummarizedCard() {
  return createAdHocCard({
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
    },
  });
}

function setup({
  card = createAdHocCard(),
  withDefaultAggregation = true,
}: SetupOpts = {}) {
  const onQueryChange = jest.fn();
  const onClose = jest.fn();

  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: "id" in card ? [card] : [],
  });

  const question =
    "id" in card
      ? checkNotNull(metadata.question(card.id))
      : new Question(card, metadata);

  function Wrapper() {
    const [query, setQuery] = useState(question._getMLv2Query());

    const legacyQuery = question
      .setDatasetQuery(Lib.toLegacyQuery(query))
      .query() as StructuredQuery;

    return (
      <SummarizeSidebar
        query={query}
        legacyQuery={legacyQuery}
        onQueryChange={nextQuery => {
          setQuery(nextQuery);
          onQueryChange(nextQuery);
        }}
        onClose={onClose}
      />
    );
  }

  renderWithProviders(<Wrapper />);

  if (!withDefaultAggregation) {
    const countButton = screen.getByLabelText("Count");
    userEvent.click(within(countButton).getByLabelText("close icon"));
  }

  function getNextQuery() {
    const [lastCall] = onQueryChange.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getNextAggregations() {
    const query = getNextQuery();
    return Lib.aggregations(query, -1).map(aggregation =>
      Lib.displayInfo(query, -1, aggregation),
    );
  }

  function getNextBreakouts() {
    const query = getNextQuery();
    return Lib.breakouts(query, -1).map(breakout =>
      Lib.displayInfo(query, -1, breakout),
    );
  }

  return {
    metadata,
    getNextAggregations,
    getNextBreakouts,
    onQueryChange,
    onClose,
  };
}

describe("SummarizeSidebar", () => {
  describe("default aggregation", () => {
    it("should apply default aggregation for bare rows query", () => {
      const { getNextAggregations, onQueryChange } = setup();

      expect(screen.getByLabelText("Count")).toBeInTheDocument();
      userEvent.click(screen.getByText("Done"));

      const aggregations = getNextAggregations();
      const [aggregation] = aggregations;
      expect(aggregations).toHaveLength(1);
      expect(aggregation.displayName).toBe("Count");
      expect(onQueryChange).toHaveBeenCalledTimes(1);
    });

    it("should allow to remove a default aggregation", () => {
      const { getNextAggregations, onQueryChange } = setup();

      const countButton = screen.getByLabelText("Count");
      userEvent.click(within(countButton).getByLabelText("close icon"));

      const aggregations = getNextAggregations();
      expect(aggregations).toHaveLength(0);
      expect(onQueryChange).toHaveBeenCalledTimes(1);
    });

    it("shouldn't apply default aggregation if a query is already aggregated", () => {
      setup({ card: createSummarizedCard() });
      expect(screen.queryByLabelText("Count")).not.toBeInTheDocument();
    });
  });

  it("should list breakoutable columns", () => {
    const { metadata } = setup();
    const ordersTable = checkNotNull(metadata.table(ORDERS_ID));
    const productsTable = checkNotNull(metadata.table(PRODUCTS_ID));
    const peopleTable = checkNotNull(metadata.table(PEOPLE_ID));
    const expectedColumnCount = [
      ordersTable.fields,
      productsTable.fields,
      peopleTable.fields,
    ].flat().length;

    expect(screen.getByText("Group by")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getAllByTestId("dimension-list-item")).toHaveLength(
      expectedColumnCount,
    );
  });

  it("shouldn't list breakout columns without an aggregation", () => {
    setup({ withDefaultAggregation: false });

    expect(screen.queryByText("Group by")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("dimension-list-item").length).toBe(0);
  });

  it("should allow searching breakout columns", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText(/Find/);
    userEvent.type(searchInput, "Created");

    await waitFor(() =>
      expect(screen.getAllByTestId("dimension-list-item")).toHaveLength(3),
    );
    expect(screen.getAllByLabelText("Created At")).toHaveLength(3);
  });

  it("should highlight selected breakout columns", () => {
    setup({ card: createSummarizedCard() });

    const [ordersCreatedAt, peopleCreatedAt] =
      screen.getAllByLabelText("Created At");
    const productCategory = screen.getByLabelText("Product → Category");

    expect(ordersCreatedAt).toHaveAttribute("aria-selected", "true");
    expect(productCategory).toHaveAttribute("aria-selected", "true");
    expect(peopleCreatedAt).toHaveAttribute("aria-selected", "false");
  });

  it("should list breakouts added before opening the sidebar in a separate section", () => {
    setup({ card: createSummarizedCard() });

    const pinnedColumnList = screen.getByTestId("pinned-dimensions");
    const unpinnedColumnList = screen.getByTestId("unpinned-dimensions");

    expect(
      within(pinnedColumnList).getByText("Product → Category"),
    ).toBeInTheDocument();
    expect(
      within(pinnedColumnList).getByText("Created At"),
    ).toBeInTheDocument();

    expect(
      within(unpinnedColumnList).queryByText("Category"),
    ).not.toBeInTheDocument();

    // "Product → Created At" and "User → Created At" should still be there
    expect(within(unpinnedColumnList).getAllByText("Created At")).toHaveLength(
      2,
    );
  });

  it("should add an aggregation", async () => {
    const { getNextAggregations } = setup({ withDefaultAggregation: false });

    userEvent.click(screen.getByLabelText("Add aggregation"));

    let popover = await screen.findByLabelText("grid");
    userEvent.click(within(popover).getByText("Average of ..."));

    popover = await screen.findByLabelText("grid");
    userEvent.click(within(popover).getByText("Total"));

    await waitFor(() => {
      const [aggregation] = getNextAggregations();
      expect(aggregation.displayName).toBe("Average of Total");
    });
    expect(getNextAggregations()).toHaveLength(1);
  });

  it("should add a column-less aggregation", async () => {
    const { getNextAggregations } = setup({ withDefaultAggregation: false });

    userEvent.click(screen.getByLabelText("Add aggregation"));

    const popover = await screen.findByLabelText("grid");
    userEvent.click(within(popover).getByText("Count of rows"));

    await waitFor(() => {
      const [aggregation] = getNextAggregations();
      expect(aggregation.displayName).toBe("Count");
    });
    expect(getNextAggregations()).toHaveLength(1);
  });

  it("shouldn't allow adding an expression aggregation", async () => {
    setup();

    userEvent.click(screen.getByLabelText("Add aggregation"));

    const popover = await screen.findByLabelText("grid");
    expect(
      within(popover).queryByText(/Custom Expression/i),
    ).not.toBeInTheDocument();
  });

  it("shouldn't allow changing an aggregation to an expression", async () => {
    setup({ card: createSummarizedCard() });

    userEvent.click(screen.getByText("Max of Quantity"));
    let popover = await screen.findByTestId("aggregation-column-picker");
    userEvent.click(within(popover).getByLabelText("Back"));
    popover = await screen.findByLabelText("grid");

    expect(
      within(popover).queryByText(/Custom Expression/i),
    ).not.toBeInTheDocument();
  });

  it("should add a breakout", async () => {
    const { getNextBreakouts } = setup();

    userEvent.click(screen.getByText("Category"));

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Category");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should add multiple breakouts", async () => {
    const { getNextBreakouts } = setup();

    userEvent.click(screen.getByText("Category"));
    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Category");
    });

    const breakoutOption = screen.getByLabelText("Quantity");
    userEvent.hover(breakoutOption);
    userEvent.click(within(breakoutOption).getByLabelText("Add dimension"));

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(2));
    const [breakout1, breakout2] = getNextBreakouts();
    expect(breakout1.displayName).toBe("Category");
    expect(breakout2.displayName).toBe("Quantity: Auto binned");
  });

  it("should allow picking a temporal bucket for breakout columns", async () => {
    const { getNextBreakouts } = setup();

    const [createdAt] = screen.getAllByLabelText("Created At");
    userEvent.hover(createdAt);
    userEvent.click(within(createdAt).getByText("by month"));
    const [quarter] = await screen.findAllByText("Quarter");
    userEvent.click(quarter);

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Created At: Quarter");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should allow picking a binning strategy for breakout columns", async () => {
    const { getNextBreakouts } = setup();

    const [total] = screen.getAllByLabelText("Total");
    userEvent.hover(total);
    userEvent.click(within(total).getByText("Auto bin"));
    const [strategy] = await screen.findAllByText("10 bins");
    userEvent.click(strategy);

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Total: 10 bins");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should add a new column instead of replacing when adding a bucketed column", async () => {
    const { getNextBreakouts } = setup({ card: createSummarizedCard() });

    const [total] = screen.getAllByLabelText("Total");
    userEvent.hover(total);
    userEvent.click(within(total).getByText("Auto bin"));
    const [strategy] = await screen.findAllByText("10 bins");
    userEvent.click(strategy);

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(3));
  });

  it("should remove breakout", async () => {
    const { getNextBreakouts } = setup({ card: createSummarizedCard() });

    const [breakout] = screen.getAllByLabelText("Created At");
    userEvent.click(within(breakout).getByLabelText("Remove dimension"));

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(1));
    expect(getNextBreakouts()[0].longDisplayName).toBe("Product → Category");
  });

  it("should replace breakouts by clicking on a column", async () => {
    const { getNextBreakouts } = setup({ card: createSummarizedCard() });

    userEvent.click(screen.getByText("Quantity"));

    await waitFor(() => {
      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Quantity: Auto binned");
    });
    expect(getNextBreakouts()).toHaveLength(1);
  });

  it("should close on 'Done' button", () => {
    const { onClose } = setup();
    userEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });
});
