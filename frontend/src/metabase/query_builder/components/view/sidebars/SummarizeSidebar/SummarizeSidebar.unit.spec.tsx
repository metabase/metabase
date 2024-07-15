import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
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

async function setup({
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
    const [query, setQuery] = useState(question.query());

    return (
      <SummarizeSidebar
        query={query}
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
    await userEvent.click(within(countButton).getByLabelText("close icon"));
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

    it("should allow to add the default aggregation manually after it was removed", async () => {
      const { getNextAggregations, onQueryChange } = await setup();

      const countButton = screen.getByLabelText("Count");
      await userEvent.click(within(countButton).getByLabelText("close icon"));
      await userEvent.click(screen.getByText("Add a metric"));
      await userEvent.click(await screen.findByText("Count of rows"));

      const aggregations = getNextAggregations();
      const [aggregation] = aggregations;
      expect(aggregations).toHaveLength(1);
      expect(aggregation.displayName).toBe("Count");
      expect(onQueryChange).toHaveBeenCalledTimes(1);
    });

    it("shouldn't apply default aggregation if a query is already aggregated", async () => {
      await setup({ card: createSummarizedCard() });
      expect(screen.queryByLabelText("Count")).not.toBeInTheDocument();
    });
  });

  it("should list breakoutable columns", async () => {
    const { metadata } = await setup();
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
    await setup({ card: createSummarizedCard() });

    const [ordersCreatedAt, peopleCreatedAt] =
      screen.getAllByLabelText("Created At");
    const productCategory = screen.getByLabelText("Product → Category");

    expect(ordersCreatedAt).toHaveAttribute("aria-selected", "true");
    expect(productCategory).toHaveAttribute("aria-selected", "true");
    expect(peopleCreatedAt).toHaveAttribute("aria-selected", "false");
  });

  it("should list breakouts added before opening the sidebar in a separate section", async () => {
    await setup({ card: createSummarizedCard() });

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
    await setup({ card: createSummarizedCard() });

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
    const { getNextBreakouts } = await setup({ card: createSummarizedCard() });

    const [total] = screen.getAllByLabelText("Total");
    await userEvent.hover(total);
    await userEvent.click(within(total).getByText("Auto bin"));
    const [strategy] = await screen.findAllByText("10 bins");
    await userEvent.click(strategy);

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(3));
  });

  it("should remove breakout", async () => {
    const { getNextBreakouts } = await setup({ card: createSummarizedCard() });

    const [breakout] = screen.getAllByLabelText("Created At");
    await userEvent.click(within(breakout).getByLabelText("Remove dimension"));

    await waitFor(() => expect(getNextBreakouts()).toHaveLength(1));
    expect(getNextBreakouts()[0].longDisplayName).toBe("Product → Category");
  });

  it("should replace breakouts by clicking on a column", async () => {
    const { getNextBreakouts } = await setup({ card: createSummarizedCard() });

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
