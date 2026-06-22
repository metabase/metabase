import { renderWithProviders, screen } from "__support__/ui";
import { isTouchDevice } from "metabase/utils/browser";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER, columnFinder } from "metabase-lib/test-helpers";
import {
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

import { JoinColumnButton } from "./JoinColumnButton";

jest.mock("metabase/utils/browser", () => ({
  ...jest.requireActual("metabase/utils/browser"),
  isTouchDevice: jest.fn(() => false),
}));

const scrollIntoViewMock = jest.fn();

const ORDERS_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
    },
  ],
});

function setup({
  query = ORDERS_QUERY,
  tableName,
  lhsExpression,
  rhsExpression,
  isOpened = false,
  isLhsPicker = true,
  isReadOnly = false,
  touch = false,
}: {
  query?: Lib.Query;
  tableName?: string;
  lhsExpression?: Lib.ExpressionClause;
  rhsExpression?: Lib.ExpressionClause;
  isOpened?: boolean;
  isLhsPicker?: boolean;
  isReadOnly?: boolean;
  touch?: boolean;
} = {}) {
  (isTouchDevice as jest.Mock).mockReturnValue(touch);

  return renderWithProviders(
    <JoinColumnButton
      query={query}
      stageIndex={0}
      tableName={tableName}
      lhsExpression={lhsExpression}
      rhsExpression={rhsExpression}
      isLhsPicker={isLhsPicker}
      isOpened={isOpened}
      isReadOnly={isReadOnly}
      onClick={jest.fn()}
    />,
  );
}

describe("JoinColumnButton scroll on auto-open", () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("scrolls into view on auto-open on touch devices", () => {
    setup({ isOpened: true, touch: true });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  });

  it("does not scroll when mounted as closed then opened later", () => {
    const { rerender } = setup({ isOpened: false, touch: true });

    scrollIntoViewMock.mockClear();

    rerender(
      <JoinColumnButton
        query={ORDERS_QUERY}
        stageIndex={0}
        tableName={undefined}
        lhsExpression={undefined}
        rhsExpression={undefined}
        isLhsPicker
        isOpened
        isReadOnly={false}
        onClick={jest.fn()}
      />,
    );

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("does not scroll on desktop", () => {
    setup({ isOpened: true, touch: false });

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});

const QUERY_WITH_JOINS = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      joins: [
        {
          source: { type: "table", id: PEOPLE_ID },
          strategy: "left-join",
          conditions: [
            {
              operator: "=",
              left: { type: "column", name: "USER_ID" },
              right: { type: "column", name: "ID" },
            },
          ],
        },
        {
          source: { type: "table", id: PRODUCTS_ID },
          strategy: "left-join",
          conditions: [
            {
              operator: "=",
              left: { type: "column", name: "PRODUCT_ID" },
              right: { type: "column", name: "ID" },
            },
          ],
        },
      ],
    },
  ],
});

const PRODUCTS_JOIN = Lib.joins(QUERY_WITH_JOINS, 0)[1];

function getProductsJoinLhsColumn(tableName: string, columnName: string) {
  const columns = Lib.joinConditionLHSColumns(
    QUERY_WITH_JOINS,
    0,
    PRODUCTS_JOIN,
    undefined,
    undefined,
  );
  const findColumn = columnFinder(QUERY_WITH_JOINS, columns);
  return Lib.expressionClause(findColumn(tableName, columnName));
}

describe("JoinColumnButton LHS table label (metabase#72823)", () => {
  // The parent computes a single join-level LHS name and passes it down to
  // every condition's picker. For the Products join above that name is "Orders"
  // (derived from the existing FK condition), but the LHS column the user picks
  // may come from a different table — so the button must label it by the
  // selected column's own table, not the join-level name.
  const JOIN_LEVEL_TABLE_NAME = "Orders";

  it("falls back to the provided table name before a column is picked", () => {
    setup({
      query: QUERY_WITH_JOINS,
      tableName: JOIN_LEVEL_TABLE_NAME,
      lhsExpression: undefined,
    });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Pick a column…")).toBeInTheDocument();
  });

  it("labels a LHS column from a previous join with that join's table", () => {
    setup({
      query: QUERY_WITH_JOINS,
      tableName: JOIN_LEVEL_TABLE_NAME,
      lhsExpression: getProductsJoinLhsColumn("PEOPLE", "SOURCE"),
    });

    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
  });

  it("labels a LHS column from the source table with the source table", () => {
    setup({
      query: QUERY_WITH_JOINS,
      tableName: JOIN_LEVEL_TABLE_NAME,
      lhsExpression: getProductsJoinLhsColumn("ORDERS", "TAX"),
    });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Tax")).toBeInTheDocument();
  });

  it("uses the provided table name for the RHS picker", () => {
    const rhsColumns = Lib.joinConditionRHSColumns(
      QUERY_WITH_JOINS,
      0,
      PRODUCTS_JOIN,
      undefined,
      undefined,
    );
    const findColumn = columnFinder(QUERY_WITH_JOINS, rhsColumns);
    const rhsExpression = Lib.expressionClause(
      findColumn("PRODUCTS", "CATEGORY"),
    );

    setup({
      query: QUERY_WITH_JOINS,
      tableName: "Products",
      rhsExpression,
      isLhsPicker: false,
    });

    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
  });
});
