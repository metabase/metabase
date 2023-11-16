import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import type { FieldReference } from "metabase-types/api";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import { BulkFilterModal } from "./BulkFilterModal";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

type SetupOpts = {
  query?: Lib.Query;
};

function setup({ query = createQuery({ metadata }) }: SetupOpts = {}) {
  const onSubmit = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <BulkFilterModal
      query={query}
      opened
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );

  function getNextQuery() {
    const [query] = onSubmit.mock.lastCall;
    return query;
  }

  function getNextFilterParts(stageIndex = 0) {
    const query = getNextQuery();
    return Lib.filters(query, stageIndex).map(filter =>
      Lib.filterParts(query, stageIndex, filter),
    );
  }

  return { getNextFilterParts, onSubmit, onClose };
}

describe("BulkFilterModal", () => {
  it("should display a list of columns", () => {
    setup();

    expect(screen.getByRole("heading")).toHaveTextContent("Filter by");

    expect(screen.getByText("User ID")).toBeInTheDocument();
    expect(screen.getByText("Discount")).toBeInTheDocument();

    expect(screen.queryByText("Rating")).not.toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();

    userEvent.click(screen.getByRole("tab", { name: "Product" }));

    expect(screen.getByText("Rating")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();

    expect(screen.queryByText("User ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Discount")).not.toBeInTheDocument();
  });

  it("should navigate between column groups", () => {
    setup();

    expect(screen.getByRole("tablist")).toBeInTheDocument();

    const orderTab = screen.getByRole("tab", { name: "Order" });
    const userTab = screen.getByRole("tab", { name: "User" });
    const productTab = screen.getByRole("tab", { name: "Product" });

    expect(orderTab).toHaveAttribute("aria-selected", "true");
    expect(productTab).toHaveAttribute("aria-selected", "false");
    expect(userTab).toHaveAttribute("aria-selected", "false");

    userEvent.click(productTab);

    expect(orderTab).toHaveAttribute("aria-selected", "false");
    expect(productTab).toHaveAttribute("aria-selected", "true");
    expect(userTab).toHaveAttribute("aria-selected", "false");
  });

  it("should not display navigation when there's only one column group", () => {
    const query = Lib.withDifferentTable(createQuery(), PRODUCTS_ID);
    setup({ query });

    expect(screen.getByRole("heading")).toHaveTextContent("Filter Products by");

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    expect(screen.queryByText(/Order(s?)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Review(s?)/)).not.toBeInTheDocument();
    expect(screen.queryByText("Product")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it("should disable submit when there're no changes", () => {
    setup();
    const applyButton = screen.getByRole("button", { name: "Apply filters" });
    expect(applyButton).toBeDisabled();
  });

  it("should close", () => {
    const { onClose } = setup();
    userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  describe("multi-stage query", () => {
    it("should display a list of columns from last two stages", () => {
      setup({ query: createTwoStageQuery() });

      expect(screen.getByText("User ID")).toBeInTheDocument();
      expect(screen.getByText("Discount")).toBeInTheDocument();
      expect(screen.getByText("Stage 1 CC")).toBeInTheDocument();

      expect(screen.queryByText("Rating")).not.toBeInTheDocument();
      expect(screen.queryByText("Category")).not.toBeInTheDocument();

      expect(screen.queryByText("Count")).not.toBeInTheDocument();
      expect(screen.queryByText("Stage 2 CC")).not.toBeInTheDocument();
    });

    it("should call the second stage column group 'Summaries'", () => {
      setup({ query: createTwoStageQuery() });
      const tab = screen.getByRole("tab", { name: "Summaries" });

      expect(tab).toHaveAttribute("aria-selected", "false");
      userEvent.click(tab);

      expect(screen.getByText("Count")).toBeInTheDocument();
      expect(screen.getByText("Stage 2 CC")).toBeInTheDocument();

      expect(tab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Product" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should list tables available in first stage", () => {
      setup({ query: createTwoStageQuery() });

      expect(screen.getByText("Order")).toBeInTheDocument();
      expect(screen.getByText("Product")).toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();

      expect(screen.queryByText("Review")).not.toBeInTheDocument();
    });
  });
});

function createTwoStageQuery() {
  const ORDERS_CREATED_AT_FIELD_REF: FieldReference = [
    "field",
    ORDERS.CREATED_AT,
    {
      "base-type": "type/DateTime",
      "temporal-unit": "month",
    },
  ];

  const PRODUCT_CATEGORY_FIELD_REF: FieldReference = [
    "field",
    PRODUCTS.CATEGORY,
    {
      "base-type": "type/Text",
      "source-field": ORDERS.PRODUCT_ID,
    },
  ];

  const COUNT_FIELD_REF: FieldReference = [
    "field",
    "count",
    { "base-type": "type/Integer" },
  ];

  return Lib.fromLegacyQuery(SAMPLE_DB_ID, metadata, {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      expressions: {
        "Stage 2 CC": ["+", 2, 2],
      },
      filter: [">", COUNT_FIELD_REF, 5],
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [ORDERS_CREATED_AT_FIELD_REF],
        expressions: {
          "Stage 1 CC": ["+", 1, 1],
        },
        filter: ["=", PRODUCT_CATEGORY_FIELD_REF, "Doohickey"],
      },
    },
  });
}
