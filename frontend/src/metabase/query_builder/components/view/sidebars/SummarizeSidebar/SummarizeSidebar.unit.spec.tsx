import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { render, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/core/utils/types";
import type { Card, UnsavedCard } from "metabase-types/api";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import SummarizeSidebar from "./SummarizeSidebar";

type SetupOpts = {
  card?: Card | UnsavedCard;
  isResultDirty?: boolean;
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
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    },
  });
}

function setup({
  card = createAdHocCard(),
  isResultDirty = false,
  withDefaultAggregation = true,
}: SetupOpts = {}) {
  const updateQuestion = jest.fn();
  const runQuestionQuery = jest.fn();
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
    const [_question, setQuestion] = useState(question);
    return (
      <SummarizeSidebar
        question={_question}
        isResultDirty={isResultDirty}
        updateQuestion={(nextQuestion, ...opts) => {
          setQuestion(nextQuestion);
          updateQuestion(nextQuestion, ...opts);
        }}
        runQuestionQuery={runQuestionQuery}
        onClose={onClose}
      />
    );
  }

  render(<Wrapper />);

  if (!withDefaultAggregation) {
    const countButton = screen.getByRole("button", { name: "Count" });
    userEvent.click(within(countButton).getByLabelText("close icon"));
  }

  function getUpdatedQuestion() {
    const [lastCall] = updateQuestion.mock.calls.slice(-1);
    return lastCall[0] as Question;
  }

  function getUpdatedQuery() {
    const question = getUpdatedQuestion();
    return question.query() as StructuredQuery;
  }

  function getUpdatedAggregations() {
    return getUpdatedQuery()
      .aggregations()
      .map(clause => clause.raw());
  }

  function getUpdatedBreakouts() {
    return getUpdatedQuery()
      .breakouts()
      .map(clause => clause.raw());
  }

  return {
    metadata,
    getUpdatedQuestion,
    getUpdatedAggregations,
    getUpdatedBreakouts,
    updateQuestion,
    runQuestionQuery,
    onClose,
  };
}

describe("SummarizeSidebar", () => {
  describe("default aggregation", () => {
    it("should apply default aggregation for bare rows query", () => {
      const { getUpdatedAggregations, updateQuestion } = setup();

      expect(screen.getByRole("button", { name: "Count" })).toBeInTheDocument();
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(getUpdatedAggregations()).toEqual([["count"]]);
      expect(updateQuestion).toHaveBeenCalledWith(expect.any(Question), {
        run: true,
      });
    });

    it("should allow to remove a default aggregation", () => {
      const { getUpdatedAggregations, updateQuestion } = setup();

      const countButton = screen.getByRole("button", { name: "Count" });
      userEvent.click(within(countButton).getByLabelText("close icon"));
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(getUpdatedAggregations()).toHaveLength(0);
      expect(updateQuestion).toHaveBeenCalledWith(expect.any(Question), {
        run: true,
      });
    });

    it("shouldn't apply default aggregation if a query is already aggregated", () => {
      setup({ card: createSummarizedCard() });
      expect(
        screen.queryByRole("button", { name: "Count" }),
      ).not.toBeInTheDocument();
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
    expect(screen.getAllByText("Created At")).toHaveLength(3);
  });

  it("should highlight selected breakout columns", () => {
    setup({ card: createSummarizedCard() });

    const [ordersCreatedAt, peopleCreatedAt] = screen.getAllByRole("listitem", {
      name: "Created At",
    });

    expect(ordersCreatedAt).toHaveAttribute("aria-selected", "true");
    expect(peopleCreatedAt).toHaveAttribute("aria-selected", "false");
  });

  it("should add an aggregation", async () => {
    const { getUpdatedAggregations } = setup({ withDefaultAggregation: false });

    userEvent.click(screen.getByRole("button", { name: "Add aggregation" }));

    let popover = await screen.findByRole("grid");
    userEvent.click(within(popover).getByText("Average of ..."));

    popover = await screen.findByRole("grid");
    userEvent.click(within(popover).getByText("Total"));

    await waitFor(() =>
      expect(getUpdatedAggregations()).toEqual([
        ["avg", ["field", ORDERS.TOTAL, null]],
      ]),
    );
  });

  it("should add a column-less aggregation", async () => {
    const { getUpdatedAggregations } = setup({ withDefaultAggregation: false });

    userEvent.click(screen.getByRole("button", { name: "Add aggregation" }));

    const popover = await screen.findByRole("grid");
    userEvent.click(within(popover).getByText("Count of rows"));

    await waitFor(() => expect(getUpdatedAggregations()).toEqual([["count"]]));
  });

  it("should add a breakout", async () => {
    const { getUpdatedBreakouts } = setup();

    userEvent.click(screen.getByText("Category"));

    await waitFor(() => {
      expect(getUpdatedBreakouts()).toEqual([
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ]);
    });
  });

  it("should add multiple breakouts", async () => {
    const { getUpdatedBreakouts } = setup();

    userEvent.click(screen.getByText("Category"));
    await waitFor(() => {
      expect(getUpdatedBreakouts()).toEqual([
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ]);
    });

    const breakoutOption = screen.getByRole("listitem", { name: "Quantity" });
    userEvent.hover(breakoutOption);
    userEvent.click(within(breakoutOption).getByLabelText("Add dimension"));

    await waitFor(() =>
      expect(getUpdatedBreakouts()).toEqual([
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ["field", ORDERS.QUANTITY, { binning: { strategy: "default" } }],
      ]),
    );
  });

  it("should allow picking a temporal bucket for breakout columns", async () => {
    const { getUpdatedBreakouts } = setup();

    const [createdAt] = screen.getAllByRole("listitem", { name: "Created At" });
    userEvent.hover(createdAt);
    userEvent.click(within(createdAt).getByText("by month"));
    const [quarter] = await screen.findAllByText("Quarter");
    userEvent.click(quarter);

    await waitFor(() =>
      expect(getUpdatedBreakouts()).toEqual([
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "quarter" }],
      ]),
    );
  });

  it("should allow picking a binning strategy for breakout columns", async () => {
    const { getUpdatedBreakouts } = setup();

    const [total] = screen.getAllByRole("listitem", { name: "Total" });
    userEvent.hover(total);
    userEvent.click(within(total).getByText("Auto bin"));
    const [strategy] = await screen.findAllByText("10 bins");
    userEvent.click(strategy);

    await waitFor(() =>
      expect(getUpdatedBreakouts()).toEqual([
        [
          "field",
          ORDERS.TOTAL,
          { binning: { strategy: "num-bins", "num-bins": 10 } },
        ],
      ]),
    );
  });

  it("should remove breakout", async () => {
    const { getUpdatedBreakouts } = setup({ card: createSummarizedCard() });

    const [breakout] = screen.getAllByRole("listitem", { name: "Created At" });
    userEvent.click(
      within(breakout).getByRole("button", { name: "Remove dimension" }),
    );

    await waitFor(() => expect(getUpdatedBreakouts()).toEqual([]));
  });

  it("should replace breakouts by clicking on a column", async () => {
    const { getUpdatedBreakouts } = setup({ card: createSummarizedCard() });

    userEvent.click(screen.getByText("Quantity"));

    await waitFor(() =>
      expect(getUpdatedBreakouts()).toEqual([
        ["field", ORDERS.QUANTITY, { binning: { strategy: "default" } }],
      ]),
    );
  });

  it("should close on 'Done' button click", () => {
    const { onClose } = setup();
    userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("should pick a suitable visualization", async () => {
    const { getUpdatedQuestion } = setup({ card: createSummarizedCard() });

    const category = screen.getByRole("listitem", { name: "Category" });
    userEvent.hover(category);
    userEvent.click(within(category).getByLabelText("Add dimension"));

    userEvent.click(screen.getByRole("button", { name: "Done" }));

    const nextQuestion = getUpdatedQuestion();
    expect(nextQuestion.display()).toBe("line");
  });
});
