import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

function getJoinQueryHelpers(query: Lib.Query) {
  const table = Lib.tableOrCardMetadata(query, PRODUCTS_ID);

  const findLHSColumn = columnFinder(
    query,
    Lib.joinConditionLHSColumns(query, 0),
  );
  const findRHSColumn = columnFinder(
    query,
    Lib.joinConditionRHSColumns(query, 0, table),
  );

  const defaultOperator = Lib.joinConditionOperators(query, 0).find(
    operator => Lib.displayInfo(query, 0, operator).default,
  );

  if (!defaultOperator) {
    throw new Error("No default operator found");
  }

  return { table, defaultOperator, findLHSColumn, findRHSColumn };
}

function getJoinedQuery() {
  const query = createQuery({ metadata });

  const { table, defaultOperator, findLHSColumn, findRHSColumn } =
    getJoinQueryHelpers(query);

  const ordersProductId = findLHSColumn("ORDERS", "PRODUCT_ID");
  const productsId = findRHSColumn("PRODUCTS", "ID");

  const condition = Lib.joinConditionClause(
    query,
    0,
    defaultOperator,
    ordersProductId,
    productsId,
  );

  const join = Lib.withJoinFields(Lib.joinClause(table, [condition]), "all");

  return Lib.join(query, 0, join);
}

function getJoinedQueryWithMultipleConditions() {
  const query = getJoinedQuery();
  const { defaultOperator, findLHSColumn, findRHSColumn } =
    getJoinQueryHelpers(query);

  const [currentJoin] = Lib.joins(query, 0);
  const currentConditions = Lib.joinConditions(currentJoin);

  const ordersCreatedAt = findLHSColumn("ORDERS", "CREATED_AT");
  const productsCreatedAt = findRHSColumn("PRODUCTS", "CREATED_AT");

  const condition = Lib.joinConditionClause(
    query,
    0,
    defaultOperator,
    ordersCreatedAt,
    productsCreatedAt,
  );

  const nextJoin = Lib.withJoinConditions(currentJoin, [
    ...currentConditions,
    condition,
  ]);

  return Lib.replaceClause(query, 0, currentJoin, nextJoin);
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
      const { operator, lhsColumn, rhsColumn } = Lib.joinConditionParts(
        query,
        0,
        condition,
      );
      return {
        operator: Lib.displayInfo(query, 0, operator),
        lhsColumn: Lib.displayInfo(query, 0, lhsColumn),
        rhsColumn: Lib.displayInfo(query, 0, rhsColumn),
      };
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

  it("shouldn't let changing the RHS table", () => {
    setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

    const rhsTablePicker = screen.getByLabelText("Right table");
    const pickerButton = within(rhsTablePicker).getByText("Products");

    expect(pickerButton).toBeDisabled();
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
    expect(condition.operator.shortName).toBe("=");
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
    userEvent.click(within(popover).getByText("User ID"));

    const [condition] = getRecentJoin().conditions;
    expect(condition.lhsColumn.longDisplayName).toBe("User ID");
    expect(condition.rhsColumn.longDisplayName).toBe("Products → ID");
  });

  it("should change RHS column", async () => {
    const query = getJoinedQuery();
    const { getRecentJoin } = setup(
      createMockNotebookStep({ topLevelQuery: query }),
    );

    userEvent.click(screen.getByLabelText("Right column"));
    const popover = await screen.findByLabelText("grid");
    userEvent.click(within(popover).getByText("Price"));

    const [condition] = getRecentJoin().conditions;
    expect(condition.lhsColumn.longDisplayName).toBe("Product ID");
    expect(condition.rhsColumn.longDisplayName).toBe("Products → Price");
  });

  it("shouldn't allow removing an incomplete condition", async () => {
    setup();

    userEvent.click(screen.getByLabelText("Right table"));
    const tablePicker = await screen.findByTestId("popover");
    userEvent.click(await within(tablePicker).findByText("Reviews"));

    expect(screen.queryByLabelText("Remove condition")).not.toBeInTheDocument();
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
    expect(condition.operator.shortName).toBe("!=");
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
      expect(fields).toBe("none");
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

  describe("multiple conditions", () => {
    it("should display a join correctly", () => {
      setup(
        createMockNotebookStep({
          topLevelQuery: getJoinedQueryWithMultipleConditions(),
        }),
      );

      expect(screen.getByLabelText("Left table")).toHaveTextContent("Orders");
      expect(screen.getByLabelText("Right table")).toHaveTextContent(
        "Products",
      );

      const firstCondition = screen.getByTestId("join-condition-0");
      const secondCondition = screen.getByTestId("join-condition-1");

      expect(
        within(firstCondition).getByLabelText("Left column"),
      ).toHaveTextContent("Product ID");
      expect(
        within(firstCondition).getByLabelText("Right column"),
      ).toHaveTextContent("ID");
      expect(
        within(firstCondition).getByLabelText("Change operator"),
      ).toHaveTextContent("=");

      expect(
        within(secondCondition).getByLabelText("Left column"),
      ).toHaveTextContent("Created At");
      expect(
        within(secondCondition).getByLabelText("Right column"),
      ).toHaveTextContent("Created At");
      expect(
        within(secondCondition).getByLabelText("Change operator"),
      ).toHaveTextContent("=");
    });

    it("shouldn't allow to add a new condition until the previous one is completed", async () => {
      setup();

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();

      userEvent.click(screen.getByLabelText("Right table"));
      const popover = await screen.findByTestId("popover");
      userEvent.click(await within(popover).findByText("Reviews"));

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();

      const lhsColumnPicker = await screen.findByLabelText("grid");
      userEvent.click(within(lhsColumnPicker).getByText("Product ID"));
      await waitFor(() =>
        expect(screen.getByLabelText("Left column")).toHaveTextContent(
          "Product ID",
        ),
      );

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();

      userEvent.click(screen.getByLabelText("Right column"));
      const [, rhsColumnPicker] = await screen.findAllByLabelText("grid");
      userEvent.click(within(rhsColumnPicker).getByText("Rating"));

      expect(screen.getByLabelText("Add condition")).toBeInTheDocument();
    });

    it("should add a new condition", async () => {
      const { getRecentJoin } = setup(
        createMockNotebookStep({ topLevelQuery: getJoinedQuery() }),
      );

      userEvent.click(screen.getByLabelText("Add condition"));
      const conditionContainer = screen.getByTestId("new-join-condition");

      const lhsColumnPicker = await screen.findByLabelText("grid");
      userEvent.click(within(lhsColumnPicker).getByText("Created At"));
      await waitFor(() =>
        expect(
          within(conditionContainer).getByLabelText("Left column"),
        ).toHaveTextContent("Created At"),
      );

      userEvent.click(
        within(conditionContainer).getByLabelText("Right column"),
      );
      const [, rhsColumnPicker] = await screen.findAllByLabelText("grid");
      userEvent.click(within(rhsColumnPicker).getByText("Created At"));

      const { conditions } = getRecentJoin();
      const [condition1, condition2] = conditions;

      expect(condition1.lhsColumn.longDisplayName).toBe("Product ID");
      expect(condition1.rhsColumn.longDisplayName).toBe("Products → ID");
      expect(condition2.lhsColumn.longDisplayName).toBe("Created At: Month");
      expect(condition2.rhsColumn.longDisplayName).toBe(
        "Products → Created At: Month",
      );
    });

    it("should remove an incomplete condition", async () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

      userEvent.click(screen.getByLabelText("Add condition"));
      let conditionContainer = screen.getByTestId("new-join-condition");

      userEvent.click(
        within(conditionContainer).getByLabelText("Remove condition"),
      );

      expect(
        screen.queryByTestId("new-join-condition"),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByLabelText("Add condition"));
      conditionContainer = screen.getByTestId("new-join-condition");

      const lhsColumnPicker = await screen.findByLabelText("grid");
      userEvent.click(within(lhsColumnPicker).getByText("Created At"));
      await waitFor(() =>
        expect(
          within(conditionContainer).getByLabelText("Left column"),
        ).toHaveTextContent("Created At"),
      );

      userEvent.click(
        within(conditionContainer).getByLabelText("Remove condition"),
      );
      expect(
        screen.queryByTestId("new-join-condition"),
      ).not.toBeInTheDocument();
    });

    it("should remove a complete condition", async () => {
      const { getRecentJoin } = setup(
        createMockNotebookStep({
          topLevelQuery: getJoinedQueryWithMultipleConditions(),
        }),
      );

      let firstCondition = screen.getByTestId("join-condition-0");
      const secondCondition = screen.getByTestId("join-condition-1");

      expect(
        within(firstCondition).getByLabelText("Remove condition"),
      ).toBeInTheDocument();
      expect(
        within(secondCondition).getByLabelText("Remove condition"),
      ).toBeInTheDocument();

      userEvent.click(
        within(secondCondition).getByLabelText("Remove condition"),
      );

      firstCondition = screen.getByTestId("join-condition-0");
      expect(
        within(firstCondition).getByLabelText("Left column"),
      ).toHaveTextContent("Product ID");
      expect(
        within(firstCondition).getByLabelText("Right column"),
      ).toHaveTextContent("ID");

      const { conditions } = getRecentJoin();
      const [condition] = conditions;
      expect(conditions).toHaveLength(1);
      expect(condition.lhsColumn.longDisplayName).toBe("Product ID");
      expect(condition.rhsColumn.longDisplayName).toBe("Products → ID");
    });

    it("shouldn't allow removing a single complete condition", async () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }));

      expect(
        screen.queryByLabelText("Remove condition"),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByLabelText("Add condition"));

      const firstCondition = screen.getByTestId("join-condition-0");
      expect(
        within(firstCondition).queryByLabelText("Remove condition"),
      ).not.toBeInTheDocument();
    });
  });

  describe("read-only", () => {
    it("shouldn't allow changing the join type", () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }), {
        readOnly: true,
      });

      expect(screen.getByLabelText("Change join type")).toBeDisabled();
    });

    it("shouldn't allow changing the operator", () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }), {
        readOnly: true,
      });

      expect(screen.getByLabelText("Change operator")).toBeDisabled();
    });

    it("shouldn't allow changing the join fields", () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }), {
        readOnly: true,
      });

      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("shouldn't allow changing columns", () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }), {
        readOnly: true,
      });

      expect(screen.getByLabelText("Left column")).toBeDisabled();
      expect(screen.getByLabelText("Right column")).toBeDisabled();
    });

    it("shouldn't allow adding a new condition", () => {
      setup(createMockNotebookStep({ topLevelQuery: getJoinedQuery() }), {
        readOnly: true,
      });

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();
    });

    it("shouldn't allow removing a condition", async () => {
      const query = getJoinedQueryWithMultipleConditions();
      setup(createMockNotebookStep({ topLevelQuery: query }), {
        readOnly: true,
      });

      expect(
        screen.queryByLabelText("Remove condition"),
      ).not.toBeInTheDocument();
    });
  });
});
