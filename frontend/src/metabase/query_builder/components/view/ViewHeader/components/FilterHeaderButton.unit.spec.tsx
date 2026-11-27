import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  REVIEWS,
  REVIEWS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FilterHeaderButton } from "./FilterHeaderButton";

const queryWithFilters = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      filters: [
        {
          type: "operator",
          operator: ">",
          args: [
            { type: "literal", value: 1 },
            { type: "literal", value: 2 },
          ],
        },
      ],
    },
  ],
});

const QUESTION_WITH_FILTERS = Question.create({
  metadata: SAMPLE_METADATA,
}).setQuery(queryWithFilters);

const queryWithoutFilters = Lib.createTestQuery(
  SAMPLE_PROVIDER,
  DEFAULT_TEST_QUERY,
);

const QUESTION_WITHOUT_FILTERS = Question.create({
  metadata: SAMPLE_METADATA,
}).setQuery(queryWithoutFilters);

const ORDERS_QUESTION = createMockCard({
  id: 101,
  name: "Q0 Orders",
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
});

const BASE_QUESTION = createMockCard({
  id: 102,
  name: "Base Orders Question",
  dataset_query: Lib.createTestJsQuery(
    createMetadataProvider({
      metadata: createMockMetadata({
        databases: [createSampleDatabase()],
        questions: [ORDERS_QUESTION],
      }),
    }),
    { stages: [{ source: { type: "card", id: ORDERS_QUESTION.id } }] },
  ),
});

const BASE_QUESTION_METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [ORDERS_QUESTION, BASE_QUESTION],
});

// A join, a custom column, an aggregation and 2 breakouts on a saved question
const AGGREGATED_QUERY = Lib.createTestQuery(
  createMetadataProvider({ metadata: BASE_QUESTION_METADATA }),
  {
    stages: [
      {
        source: { type: "card", id: BASE_QUESTION.id },
        expressions: [
          {
            name: "Net",
            value: {
              type: "operator",
              operator: "-",
              args: [
                { type: "column", name: "TOTAL" },
                { type: "column", name: "TAX" },
              ],
            },
          },
        ],
        joins: [
          {
            source: { type: "table", id: REVIEWS_ID },
            strategy: "left-join",
            alias: "Reviews - Product",
            conditions: [
              {
                operator: "=",
                left: { type: "column", name: "PRODUCT_ID" },
                right: { type: "column", fieldId: REVIEWS.PRODUCT_ID },
              },
            ],
          },
        ],
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts: [
          { type: "column", fieldId: ORDERS.CREATED_AT, unit: "month" },
          {
            type: "column",
            fieldId: PRODUCTS.CATEGORY,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
        ],
      },
    ],
  },
);

const createAggregatedQuestion = (display: "pivot" | "table") =>
  Question.create({ metadata: BASE_QUESTION_METADATA, display }).setQuery(
    AGGREGATED_QUERY,
  );

type SetupOpts = {
  question?: Question;
  isExpanded?: boolean;
};

function setup({
  question = QUESTION_WITHOUT_FILTERS,
  isExpanded = false,
}: SetupOpts) {
  const onExpand = jest.fn();
  const onCollapse = jest.fn();

  renderWithProviders(
    <FilterHeaderButton
      question={question}
      isExpanded={isExpanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
    />,
  );

  return { onExpand, onCollapse };
}

describe("FilterHeaderButton", () => {
  it("should render filter button", () => {
    setup({ question: QUESTION_WITHOUT_FILTERS });
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByTestId("question-filter-header")).toBeInTheDocument();
  });

  it("should render filter count when a query has filters", () => {
    setup({ question: QUESTION_WITH_FILTERS });
    expect(screen.getByTestId("filters-visibility-control")).toHaveTextContent(
      "1",
    );
  });

  it("should not render filter count when a query has 0 filters", () => {
    setup({ question: QUESTION_WITHOUT_FILTERS });
    expect(
      screen.queryByTestId("filters-visibility-control"),
    ).not.toBeInTheDocument();
  });

  it("should populate true data-expanded property", () => {
    setup({ question: QUESTION_WITH_FILTERS, isExpanded: true });
    expect(screen.getByTestId("filters-visibility-control")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("should populate false data-expanded property", () => {
    setup({ question: QUESTION_WITH_FILTERS, isExpanded: false });
    expect(screen.getByTestId("filters-visibility-control")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });

  it("should not offer the columns of an extra filtering stage for a pivot table", async () => {
    setup({ question: createAggregatedQuestion("pivot") });
    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    expect(await screen.findByText("Base Orders Question")).toBeInTheDocument();
    expect(screen.queryByText("Summaries")).not.toBeInTheDocument();
  });

  it("should offer the columns of an extra filtering stage for other displays", async () => {
    setup({ question: createAggregatedQuestion("table") });
    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    expect(await screen.findByText("Base Orders Question")).toBeInTheDocument();
    expect(screen.getByText("Summaries")).toBeInTheDocument();
  });
});
