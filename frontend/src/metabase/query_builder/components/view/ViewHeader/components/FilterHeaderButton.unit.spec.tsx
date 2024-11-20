import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FilterHeaderButton } from "./FilterHeaderButton";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const QUERY_WITH_FILTERS = Question.create({
  databaseId: SAMPLE_DB_ID,
  tableId: ORDERS_ID,
  metadata,
})
  // eslint-disable-next-line no-restricted-syntax
  .legacyQuery({ useStructuredQuery: true })
  .aggregate(["count"])
  .filter(["time-interval", ["field", ORDERS.CREATED_AT, null], -30, "day"])
  .filter(["=", ["field", ORDERS.TOTAL, null], 1234])
  .filter([
    "contains",
    ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
    "asdf",
  ])
  .question()
  .query();

const QUERY_WITHOUT_FILTERS = Question.create({
  databaseId: SAMPLE_DB_ID,
  tableId: ORDERS_ID,
  metadata,
})
  // eslint-disable-next-line no-restricted-syntax
  .legacyQuery({ useStructuredQuery: true })
  .aggregate(["count"])
  .question()
  .query();

describe("FilterHeaderButton", () => {
  it("should render filter button", () => {
    renderWithProviders(<FilterHeaderButton onOpenModal={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByTestId("question-filter-header")).toBeInTheDocument();
  });

  it("should not render filter count without a query", () => {
    renderWithProviders(<FilterHeaderButton onOpenModal={jest.fn()} />);

    expect(
      screen.queryByTestId("filters-visibility-control"),
    ).not.toBeInTheDocument();
  });

  it("should render filter count when a query has filters", () => {
    renderWithProviders(
      <FilterHeaderButton
        onOpenModal={jest.fn()}
        query={QUERY_WITH_FILTERS}
        isExpanded={false}
        onExpand={jest.fn()}
        onCollapse={jest.fn()}
      />,
    );
    expect(screen.getByTestId("filters-visibility-control")).toHaveTextContent(
      "3",
    );
  });

  it("should not render filter count when a query has 0 filters", () => {
    renderWithProviders(
      <FilterHeaderButton
        onOpenModal={jest.fn()}
        query={QUERY_WITHOUT_FILTERS}
        isExpanded={false}
        onExpand={jest.fn()}
        onCollapse={jest.fn()}
      />,
    );
    expect(
      screen.queryByTestId("filters-visibility-control"),
    ).not.toBeInTheDocument();
  });

  it("should not render filter count without onCollapse function", () => {
    renderWithProviders(
      <FilterHeaderButton
        onOpenModal={jest.fn()}
        query={QUERY_WITH_FILTERS}
        isExpanded={false}
        onExpand={jest.fn()}
      />,
    );
    expect(
      screen.queryByTestId("filters-visibility-control"),
    ).not.toBeInTheDocument();
  });

  it("should not render filter count without onExpand function", () => {
    renderWithProviders(
      <FilterHeaderButton
        onOpenModal={jest.fn()}
        query={QUERY_WITH_FILTERS}
        isExpanded={false}
        onCollapse={jest.fn()}
      />,
    );
    expect(
      screen.queryByTestId("filters-visibility-control"),
    ).not.toBeInTheDocument();
  });

  it("should populate true data-expanded property", () => {
    renderWithProviders(
      <FilterHeaderButton
        onOpenModal={jest.fn()}
        query={QUERY_WITH_FILTERS}
        isExpanded={true}
        onExpand={jest.fn()}
        onCollapse={jest.fn()}
      />,
    );
    expect(screen.getByTestId("filters-visibility-control")).toHaveAttribute(
      "data-expanded",
      "true",
    );
  });

  it("should populate false data-expanded property", () => {
    renderWithProviders(
      <FilterHeaderButton
        onOpenModal={jest.fn()}
        query={QUERY_WITH_FILTERS}
        isExpanded={false}
        onExpand={jest.fn()}
        onCollapse={jest.fn()}
      />,
    );
    expect(screen.getByTestId("filters-visibility-control")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });
});
