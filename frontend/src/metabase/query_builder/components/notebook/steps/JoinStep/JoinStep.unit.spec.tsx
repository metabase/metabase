import { useState } from "react";
import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { createMockMetadata } from "__support__/metadata";
import { createMockEntitiesState } from "__support__/store";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createStructuredModelCard,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { createMockNotebookStep } from "../../test-utils";
import { JoinStep } from "./JoinStep";

const SAMPLE_DATABASE = createSampleDatabase();
const ANOTHER_DATABASE = createMockDatabase({
  id: 2,
  name: "Another Database",
});
const DATABASES = [SAMPLE_DATABASE, ANOTHER_DATABASE];
const MODEL = createStructuredModelCard();

const STATE = createMockState({
  entities: createMockEntitiesState({
    databases: DATABASES,
    questions: [MODEL],
  }),
});

const metadata = createMockMetadata({
  databases: DATABASES,
  questions: [MODEL],
});

function getJoinedQuery() {
  const query = createQuery({ metadata });

  const table = Lib.tableOrCardMetadata(query, PRODUCTS_ID);
  const findLHSColumn = columnFinder(
    query,
    Lib.joinConditionLHSColumns(query, 0),
  );
  const findRHSColumn = columnFinder(
    query,
    Lib.joinConditionRHSColumns(query, 0, table),
  );

  const ordersProductId = findLHSColumn("ORDERS", "PRODUCT_ID");
  const productsId = findRHSColumn("PRODUCTS", "ID");

  const operator = Lib.joinConditionOperators(query, 0).find(
    operator => Lib.displayInfo(query, 0, operator).default,
  );

  if (!operator) {
    throw new Error("No default operator found");
  }

  const condition = Lib.joinConditionClause(
    operator,
    ordersProductId,
    productsId,
  );
  const join = Lib.withJoinFields(Lib.joinClause(table, [condition]), "all");

  return Lib.join(query, 0, join);
}

function setup(step = createMockNotebookStep(), { readOnly = false } = {}) {
  const updateQuery = jest.fn();

  setupDatabasesEndpoints(DATABASES);
  setupSearchEndpoints([createMockCollectionItem(MODEL)]);

  function Wrapper() {
    const [query, setQuery] = useState(step.topLevelQuery);

    const onChange = async (nextQuery: Lib.Query | StructuredQuery) => {
      if (nextQuery instanceof StructuredQuery) {
        throw new Error("Expected MLv2 query");
      }
      setQuery(nextQuery);
      updateQuery(nextQuery);
    };

    return (
      <JoinStep
        step={step}
        query={step.query}
        topLevelQuery={query}
        color="brand"
        isLastOpened={false}
        readOnly={readOnly}
        reportTimezone="UTC"
        updateQuery={onChange}
      />
    );
  }

  renderWithProviders(<Wrapper />, {
    storeInitialState: STATE,
  });

  function getNextQuery() {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getRecentJoin() {
    const query = getNextQuery();
    const [join] = Lib.joins(query, 0);

    const strategy = Lib.displayInfo(query, 0, Lib.joinStrategy(join));
    const fields = Lib.joinFields(join);

    const conditions = Lib.joinConditions(join).map(condition => {
      const externalOp = Lib.externalOp(condition);
      const [lhsColumn, rhsColumn] = externalOp.args.map(column =>
        Lib.displayInfo(query, 0, column),
      );
      return { ...externalOp, lhsColumn, rhsColumn };
    });

    return {
      query,
      join,
      strategy,
      conditions,
      fields,
    };
  }

  return { getRecentJoin };
}

describe("Notebook Editor > Join Step", () => {
  it("should display a join correctly", () => {
    setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

    expect(screen.getByLabelText("Left table")).toHaveTextContent("Orders");
    expect(screen.getByLabelText("Right table")).toHaveTextContent("Products");
    expect(screen.getByLabelText("Left column")).toHaveTextContent(
      "Product ID",
    );
    expect(screen.getByLabelText("Right column")).toHaveTextContent("ID");
    expect(screen.getByLabelText("Change operator")).toHaveTextContent("=");
  });

  it("should open the source query database in RHS table picker", async () => {
    setup();

    userEvent.click(screen.getByLabelText("Right table"));
    const popover = await screen.findByTestId("popover");
    await waitForElementToBeRemoved(() =>
      within(popover).queryByText(/Loading/),
    );

    expect(within(popover).getByText("Sample Database")).toBeInTheDocument();
    expect(within(popover).getByText("Products")).toBeInTheDocument();
    expect(within(popover).getByText("People")).toBeInTheDocument();
    expect(within(popover).getByText("Reviews")).toBeInTheDocument();
  });

  it("should not allow picking a right table from another database", async () => {
    setup();

    userEvent.click(screen.getByLabelText("Right table"));
    const popover = await screen.findByTestId("popover");

    // Go back to the database list
    userEvent.click(within(popover).getByText("Sample Database"));

    expect(within(popover).getByText("Sample Database")).toBeInTheDocument();
    expect(
      within(popover).queryByText(ANOTHER_DATABASE.name),
    ).not.toBeInTheDocument();
  });

  it("should open the LHS column picker after right table is selected and the RHS picker after it", async () => {
    setup();

    userEvent.click(screen.getByLabelText("Right table"));
    const tablePicker = await screen.findByTestId("popover");
    userEvent.click(await within(tablePicker).findByText("Reviews"));

    const lhsColumnPicker = await screen.findByLabelText("grid");

    expect(within(lhsColumnPicker).getByText("Order")).toBeInTheDocument();
    expect(within(lhsColumnPicker).getByText("Product ID")).toBeInTheDocument();
    expect(
      within(lhsColumnPicker).queryByText(/Review/i),
    ).not.toBeInTheDocument();

    userEvent.click(within(lhsColumnPicker).getByText("Total"));

    await screen.findAllByLabelText("grid");
    const [, rhsColumnPicker] = screen.getAllByLabelText("grid");

    expect(within(rhsColumnPicker).getByText("Reviewer")).toBeInTheDocument();
    expect(within(rhsColumnPicker).getByText("Body")).toBeInTheDocument();
  });

  it("should highlight selected LHS column", async () => {
    setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

    userEvent.click(screen.getByLabelText("Left column"));
    const popover = await screen.findByLabelText("grid");

    expect(within(popover).getByLabelText("Product ID")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(popover).getByLabelText("ID")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("should highlight selected RHS column", async () => {
    setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

    userEvent.click(screen.getByLabelText("Right column"));
    const popover = await screen.findByLabelText("grid");

    expect(within(popover).getByLabelText("ID")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(popover).getByLabelText("Category")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("should automatically open RHS table picker", async () => {
    setup();

    const popover = screen.getByTestId("popover");

    expect(await within(popover).findByText("Products")).toBeInTheDocument();
    expect(within(popover).getByText("People")).toBeInTheDocument();
    expect(within(popover).getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByLabelText("Right table")).toHaveTextContent(
      "Pick data…",
    );
  });

  it("should apply a suggested condition when table is selected", async () => {
    const { getRecentJoin } = setup();

    const popover = screen.getByTestId("popover");
    userEvent.click(await within(popover).findByText("Products"));

    expect(await screen.findByLabelText("Left column")).toHaveTextContent(
      "Product ID",
    );
    expect(screen.getByLabelText("Right column")).toHaveTextContent("ID");
    expect(screen.getByLabelText("Change operator")).toHaveTextContent("=");

    const { conditions } = getRecentJoin();
    const [condition] = conditions;
    expect(conditions).toHaveLength(1);
    expect(condition.operator).toBe("=");
    expect(condition.lhsColumn.longDisplayName).toBe("Product ID");
    expect(condition.rhsColumn.longDisplayName).toBe("Products → ID");
  });

  it("should change LHS column", async () => {
    const query = getJoinedQuery();
    const { getRecentJoin } = setup(
      createMockNotebookStep({ topLevelQuery: query }),
    );

    userEvent.click(screen.getByLabelText("Left column"));
    const popover = await screen.findByLabelText("grid");
    userEvent.click(within(popover).getByText("Created At"));

    const [condition] = getRecentJoin().conditions;
    expect(condition.lhsColumn.longDisplayName).toBe("Created At: Month");
    expect(condition.rhsColumn.longDisplayName).toBe("Products → ID");
  });

  it("should change RHS column", async () => {
    const query = getJoinedQuery();
    const { getRecentJoin } = setup(
      createMockNotebookStep({ topLevelQuery: query }),
    );

    userEvent.click(screen.getByLabelText("Right column"));
    const popover = await screen.findByLabelText("grid");
    userEvent.click(within(popover).getByText("Created At"));

    const [condition] = getRecentJoin().conditions;
    expect(condition.lhsColumn.longDisplayName).toBe("Product ID");
    expect(condition.rhsColumn.longDisplayName).toBe(
      "Products → Created At: Month",
    );
  });

  it("shouldn't show a remove column button until a column is selected", async () => {
    setup();

    const popover = screen.getByTestId("popover");
    userEvent.click(await within(popover).findByText("Reviews"));

    expect(screen.queryByLabelText("Remove")).not.toBeInTheDocument();
  });

  it("shouldn't show a remove column button in read-only mode", async () => {
    setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }), {
      readOnly: true,
    });
    expect(screen.queryByLabelText("Remove")).not.toBeInTheDocument();
  });

  it("should display temporal unit for date-time columns", async () => {
    setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

    userEvent.click(screen.getByLabelText("Left column"));
    const popover = await screen.findByLabelText("grid");
    const numericColumn = within(popover).getByLabelText("Total");
    const dateTimeColumn = within(popover).getByLabelText("Created At");

    expect(
      within(dateTimeColumn).getByLabelText("Temporal bucket"),
    ).toBeInTheDocument();
    expect(
      within(numericColumn).queryByLabelText("Binning strategy"),
    ).not.toBeInTheDocument();
  });

  it("should handle join strategy", async () => {
    const { getRecentJoin } = setup(
      createMockNotebookStep({ topLevelQuery: getJoinedQuery() }),
    );

    userEvent.click(screen.getByLabelText("Change join type"));
    let popover = await screen.findByTestId("select-list");
    let leftJoin = within(popover).getByLabelText("Left outer join");
    let rightJoin = within(popover).getByLabelText("Right outer join");

    expect(leftJoin).toHaveAttribute("aria-selected", "true");
    expect(rightJoin).toHaveAttribute("aria-selected", "false");

    userEvent.click(rightJoin);
    await waitFor(() =>
      expect(screen.queryByTestId("select-list")).not.toBeVisible(),
    );

    userEvent.click(screen.getByLabelText("Change join type"));
    popover = await screen.findByTestId("select-list");
    leftJoin = within(popover).getByLabelText("Left outer join");
    rightJoin = within(popover).getByLabelText("Right outer join");

    expect(leftJoin).toHaveAttribute("aria-selected", "false");
    expect(rightJoin).toHaveAttribute("aria-selected", "true");

    const { strategy } = getRecentJoin();
    expect(strategy.shortName).toBe("right-join");
  });

  it("should handle join operator", async () => {
    const { getRecentJoin } = setup(
      createMockNotebookStep({ topLevelQuery: getJoinedQuery() }),
    );

    userEvent.click(screen.getByLabelText("Change operator"));
    let popover = await screen.findByTestId("select-list");
    let equalsOperator = within(popover).getByLabelText("=");
    let notEqualsOperator = within(popover).getByLabelText("!=");

    expect(equalsOperator).toHaveAttribute("aria-selected", "true");
    expect(notEqualsOperator).toHaveAttribute("aria-selected", "false");

    userEvent.click(notEqualsOperator);
    await waitFor(() =>
      expect(screen.queryByTestId("select-list")).not.toBeVisible(),
    );

    userEvent.click(screen.getByLabelText("Change operator"));
    popover = await screen.findByTestId("select-list");
    equalsOperator = within(popover).getByLabelText("=");
    notEqualsOperator = within(popover).getByLabelText("!=");

    expect(equalsOperator).toHaveAttribute("aria-selected", "false");
    expect(notEqualsOperator).toHaveAttribute("aria-selected", "true");

    const [condition] = getRecentJoin().conditions;
    expect(condition.operator).toBe("!=");
  });

  describe("join fields", () => {
    it("should be 'all' by default", async () => {
      const { getRecentJoin } = setup();

      const popover = screen.getByTestId("popover");
      userEvent.click(await within(popover).findByText("Products"));

      await waitFor(() => {
        const { fields } = getRecentJoin();
        expect(fields).toBe("all");
      });
    });

    it("should select a few columns when adding a join", async () => {
      const { getRecentJoin } = setup();

      const popover = screen.getByTestId("popover");
      userEvent.click(await within(popover).findByText("Reviews"));

      userEvent.click(await screen.findByLabelText("Pick columns"));
      const joinColumnsPicker = await screen.findByTestId(
        "join-columns-picker",
      );

      // Excluding a few columns
      userEvent.click(within(joinColumnsPicker).getByText("Reviewer"));
      userEvent.click(within(joinColumnsPicker).getByText("Product ID"));
      userEvent.click(within(joinColumnsPicker).getByText("Created At"));

      // Bring Reviewer column back
      userEvent.click(within(joinColumnsPicker).getByText("Reviewer"));

      userEvent.click(screen.getByLabelText("Left column"));
      const lhsColumnPicker = await screen.findByLabelText("grid");
      userEvent.click(within(lhsColumnPicker).getByText("Product ID"));
      await waitFor(() =>
        expect(screen.getByLabelText("Left column")).toHaveTextContent(
          "Product ID",
        ),
      );

      const [, rhsColumnPicker] = await screen.findAllByLabelText("grid");
      userEvent.click(within(rhsColumnPicker).getByText("Rating"));

      const { query, fields } = getRecentJoin();
      const columns = fields as Lib.ColumnMetadata[];
      const reviewer = columns.find(
        column => Lib.displayInfo(query, 0, column).name === "REVIEWER",
      );
      const category = columns.find(
        column => Lib.displayInfo(query, 0, column).name === "PRODUCT_ID",
      );
      const price = columns.find(
        column => Lib.displayInfo(query, 0, column).name === "CREATED_AT",
      );
      expect(columns).not.toHaveLength(0);
      expect(reviewer).not.toBeUndefined();
      expect(category).toBeUndefined();
      expect(price).toBeUndefined();
    });

    it("should be able to select no columns when adding a new join", async () => {
      const { getRecentJoin } = setup();

      const popover = screen.getByTestId("popover");
      userEvent.click(await within(popover).findByText("Reviews"));

      userEvent.click(await screen.findByLabelText("Pick columns"));
      const joinColumnsPicker = await screen.findByTestId(
        "join-columns-picker",
      );

      userEvent.click(within(joinColumnsPicker).getByText("Select none"));

      userEvent.click(screen.getByLabelText("Left column"));
      const lhsColumnPicker = await screen.findByLabelText("grid");
      userEvent.click(within(lhsColumnPicker).getByText("Product ID"));
      await waitFor(() =>
        expect(screen.getByLabelText("Left column")).toHaveTextContent(
          "Product ID",
        ),
      );

      const [, rhsColumnPicker] = await screen.findAllByLabelText("grid");
      userEvent.click(within(rhsColumnPicker).getByText("Rating"));

      const { fields } = getRecentJoin();
      expect(fields).toHaveLength(0);
    });

    it("should select a few columns for an existing join", async () => {
      const { getRecentJoin } = setup(
        createMockNotebookStep({ topLevelQuery: getJoinedQuery() }),
      );

      userEvent.click(screen.getByLabelText("Pick columns"));
      const picker = await screen.findByTestId("join-columns-picker");

      // Excluding a few columns
      userEvent.click(within(picker).getByText("Vendor"));
      userEvent.click(within(picker).getByText("Price"));
      userEvent.click(within(picker).getByText("Category"));

      // Bring Vendors column back
      userEvent.click(within(picker).getByText("Vendor"));

      const { query, fields } = getRecentJoin();
      const columns = fields as Lib.ColumnMetadata[];
      const vendor = columns.find(
        column => Lib.displayInfo(query, 0, column).name === "VENDOR",
      );
      const category = columns.find(
        column => Lib.displayInfo(query, 0, column).name === "CATEGORY",
      );
      const price = columns.find(
        column => Lib.displayInfo(query, 0, column).name === "PRICE",
      );
      expect(columns).not.toHaveLength(0);
      expect(vendor).not.toBeUndefined();
      expect(category).toBeUndefined();
      expect(price).toBeUndefined();
    });

    it("should be able to select no columns for an existing join", async () => {
      const { getRecentJoin } = setup(
        createMockNotebookStep({ topLevelQuery: getJoinedQuery() }),
      );

      userEvent.click(screen.getByLabelText("Pick columns"));
      const picker = await screen.findByTestId("join-columns-picker");
      userEvent.click(within(picker).getByText("Select none"));

      const { fields } = getRecentJoin();
      expect(fields).toBe("none");
    });
  });

  it.todo("multiple conditions");
});
