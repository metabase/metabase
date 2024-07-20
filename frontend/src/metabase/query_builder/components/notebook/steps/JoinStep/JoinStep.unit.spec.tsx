import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import type { CollectionItem, RecentItem } from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockDatabase,
  createMockRecentCollectionItem,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createStructuredModelCard,
  PRODUCTS_ID,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";

import { JoinStep } from "./JoinStep";

const SAMPLE_DATABASE = createSampleDatabase();
const ANOTHER_DATABASE = createMockDatabase({
  id: 2,
  name: "Another Database",
});
const DATABASES = [SAMPLE_DATABASE, ANOTHER_DATABASE];
const MODEL = createStructuredModelCard({ name: "my cool model" });
const QUESTION = createSavedStructuredCard({
  id: 300,
  name: "other database question",
  database_id: ANOTHER_DATABASE.id,
});

const STATE = createMockState({
  entities: createMockEntitiesState({
    databases: DATABASES,
    questions: [MODEL, QUESTION],
  }),
});

const metadata = createMockMetadata({
  databases: DATABASES,
  questions: [MODEL, QUESTION],
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

  const defaultStrategy = Lib.availableJoinStrategies(query, 0).find(
    strategy => Lib.displayInfo(query, 0, strategy).default,
  );

  if (!defaultStrategy) {
    throw new Error("No default strategy found");
  }

  const defaultOperator = Lib.joinConditionOperators(query, 0).find(
    operator => Lib.displayInfo(query, 0, operator).default,
  );

  if (!defaultOperator) {
    throw new Error("No default operator found");
  }

  return {
    table,
    defaultStrategy,
    defaultOperator,
    findLHSColumn,
    findRHSColumn,
  };
}

function getJoinedQuery() {
  const query = createQuery({ metadata });

  const {
    table,
    defaultStrategy,
    defaultOperator,
    findLHSColumn,
    findRHSColumn,
  } = getJoinQueryHelpers(query);

  const ordersProductId = findLHSColumn("ORDERS", "PRODUCT_ID");
  const productsId = findRHSColumn("PRODUCTS", "ID");

  const stageIndex = -1;
  const condition = Lib.joinConditionClause(
    query,
    stageIndex,
    defaultOperator,
    ordersProductId,
    productsId,
  );

  const join = Lib.withJoinFields(
    Lib.joinClause(table, [condition], defaultStrategy),
    "all",
  );

  return Lib.join(query, stageIndex, join);
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

function setup({
  step = createMockNotebookStep(),
  readOnly = false,
  recentItems = [],
  searchItems = [],
}: {
  step?: NotebookStep;
  readOnly?: boolean;
  recentItems?: RecentItem[];
  searchItems?: CollectionItem[];
} = {}) {
  const updateQuery = jest.fn();

  setupDatabasesEndpoints(DATABASES);
  setupSearchEndpoints(searchItems);
  setupRecentViewsEndpoints(recentItems);

  function Wrapper() {
    const [query, setQuery] = useState(step.query);

    const onChange = async (nextQuery: Lib.Query) => {
      setQuery(nextQuery);
      updateQuery(nextQuery);
    };

    return (
      <JoinStep
        step={step}
        stageIndex={step.stageIndex}
        query={query}
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

  function getNextQuery(): Lib.Query {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getRecentJoin() {
    const query = getNextQuery();
    const [join] = Lib.joins(query, step.stageIndex);

    const strategy = Lib.displayInfo(query, 0, Lib.joinStrategy(join));
    const fields = Lib.joinFields(join);

    const conditions = Lib.joinConditions(join).map(condition => {
      const { operator, lhsColumn, rhsColumn } = Lib.joinConditionParts(
        query,
        step.stageIndex,
        condition,
      );
      return {
        operator: Lib.displayInfo(query, step.stageIndex, operator),
        lhsColumn: Lib.displayInfo(query, step.stageIndex, lhsColumn),
        rhsColumn: Lib.displayInfo(query, step.stageIndex, rhsColumn),
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
  beforeAll(() => {
    mockScrollBy();
    mockGetBoundingClientRect();
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  it("should display a join correctly", () => {
    setup({ step: createMockNotebookStep({ query: getJoinedQuery() }) });

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

    await userEvent.click(
      within(screen.getByLabelText("Right table")).getByRole("button"),
    );
    const modal = await screen.findByTestId("entity-picker-modal");

    expect(within(modal).getByText("Products")).toBeInTheDocument();
    expect(within(modal).getByText("People")).toBeInTheDocument();
    expect(within(modal).getByText("Reviews")).toBeInTheDocument();
  });

  it("should not allow picking a right table from another database", async () => {
    setup();

    await userEvent.click(
      within(screen.getByLabelText("Right table")).getByRole("button"),
    );
    const modal = await screen.findByTestId("entity-picker-modal");

    expect(
      within(modal).queryByText(ANOTHER_DATABASE.name),
    ).not.toBeInTheDocument();
  });

  it("questions from another database should not appear in recents (Metabase#44974)", async () => {
    setup({
      readOnly: false,
      recentItems: [
        createMockRecentCollectionItem({
          model: "dataset",
          id: MODEL.id,
          database_id: SAMPLE_DATABASE.id,
          name: MODEL.name,
        }),
        createMockRecentCollectionItem({
          model: "card",
          id: QUESTION.id,
          database_id: ANOTHER_DATABASE.id,
          name: QUESTION.name,
        }),
      ],
      searchItems: [
        createMockCollectionItem({ ...MODEL, model: "dataset" }),
        createMockCollectionItem(QUESTION),
      ],
    });

    await userEvent.click(
      within(screen.getByLabelText("Right table")).getByRole("button"),
    );
    const modal = await screen.findByTestId("entity-picker-modal");

    await waitForLoaderToBeRemoved();

    expect(within(modal).getByText("Recents")).toBeInTheDocument();
    expect(
      within(modal).getByRole("tab", { name: /Recents/i }),
    ).toHaveAttribute("aria-selected", "true");

    expect(within(modal).queryByText(QUESTION.name)).not.toBeInTheDocument();
    expect(within(modal).getByText(MODEL.name)).toBeInTheDocument();
  });

  it("should open the LHS column picker after right table is selected and the RHS picker after it", async () => {
    setup();

    await userEvent.click(
      within(screen.getByLabelText("Right table")).getByRole("button"),
    );
    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Reviews"));

    const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");

    expect(within(lhsColumnPicker).getByText("Order")).toBeInTheDocument();
    expect(within(lhsColumnPicker).getByText("Product ID")).toBeInTheDocument();
    expect(
      within(lhsColumnPicker).queryByText(/Review/i),
    ).not.toBeInTheDocument();

    await userEvent.click(within(lhsColumnPicker).getByText("Total"));

    const rhsColumnPicker = await screen.findByTestId("rhs-column-picker");

    expect(within(rhsColumnPicker).getByText("Reviewer")).toBeInTheDocument();
    expect(within(rhsColumnPicker).getByText("Body")).toBeInTheDocument();
  });

  it("should allow to change the RHS table when there are suggested join conditions", async () => {
    const { getRecentJoin } = setup({
      step: createMockNotebookStep({ query: getJoinedQuery() }),
    });

    const rhsTablePicker = screen.getByLabelText("Right table");
    const pickerButton = within(rhsTablePicker).getByText("Products");
    await userEvent.click(pickerButton);

    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("People"));

    const { conditions } = getRecentJoin();
    const [condition] = conditions;
    expect(conditions).toHaveLength(1);
    expect(condition.operator.shortName).toBe("=");
    expect(condition.lhsColumn.longDisplayName).toBe("User ID");
    expect(condition.rhsColumn.longDisplayName).toBe("People - User → ID");
  });

  it("should allow to change the RHS table when there are no suggested join conditions", async () => {
    const { getRecentJoin } = setup({
      step: createMockNotebookStep({ query: getJoinedQuery() }),
    });

    const rhsTablePicker = screen.getByLabelText("Right table");
    const pickerButton = within(rhsTablePicker).getByText("Products");
    await userEvent.click(pickerButton);

    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Reviews"));

    const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
    await userEvent.click(within(lhsColumnPicker).getByText("Total"));

    const rhsColumnPicker = await screen.findByTestId("rhs-column-picker");
    await userEvent.click(within(rhsColumnPicker).getByText("ID"));

    const { conditions } = getRecentJoin();
    const [condition] = conditions;
    expect(conditions).toHaveLength(1);
    expect(condition.operator.shortName).toBe("=");
    expect(condition.lhsColumn.longDisplayName).toBe("Total");
    expect(condition.rhsColumn.longDisplayName).toBe("Reviews → ID");
  });

  it("should highlight selected LHS column", async () => {
    setup({ step: createMockNotebookStep({ query: getJoinedQuery() }) });

    await userEvent.click(screen.getByLabelText("Left column"));
    const popover = await screen.findByTestId("lhs-column-picker");

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
    setup({ step: createMockNotebookStep({ query: getJoinedQuery() }) });

    await userEvent.click(screen.getByLabelText("Right column"));
    const popover = await screen.findByTestId("rhs-column-picker");

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

    const modal = await screen.findByTestId("entity-picker-modal");

    expect(await within(modal).findByText("Products")).toBeInTheDocument();
    expect(within(modal).getByText("People")).toBeInTheDocument();
    expect(within(modal).getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByLabelText("Right table")).toHaveTextContent(
      "Pick data…",
    );
  });

  it("should apply a suggested condition when table is selected", async () => {
    const { getRecentJoin } = setup();

    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Products"));

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
    const { getRecentJoin } = setup({
      step: createMockNotebookStep({ query }),
    });

    await userEvent.click(screen.getByLabelText("Left column"));
    const popover = await screen.findByTestId("lhs-column-picker");
    await userEvent.click(within(popover).getByText("User ID"));

    const [condition] = getRecentJoin().conditions;
    expect(condition.lhsColumn.longDisplayName).toBe("User ID");
    expect(condition.rhsColumn.longDisplayName).toBe("Products - User → ID");
  });

  it("should change RHS column", async () => {
    const query = getJoinedQuery();
    const { getRecentJoin } = setup({
      step: createMockNotebookStep({ query }),
    });

    await userEvent.click(screen.getByLabelText("Right column"));
    const popover = await screen.findByTestId("rhs-column-picker");
    await userEvent.click(within(popover).getByText("Price"));

    const [condition] = getRecentJoin().conditions;
    expect(condition.lhsColumn.longDisplayName).toBe("Product ID");
    expect(condition.rhsColumn.longDisplayName).toBe("Products → Price");
  });

  it("shouldn't allow removing an incomplete condition", async () => {
    setup();

    await userEvent.click(
      within(screen.getByLabelText("Right table")).getByRole("button"),
    );
    const modal = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(modal).findByText("Reviews"));

    expect(screen.queryByLabelText("Remove condition")).not.toBeInTheDocument();
  });

  it("should display temporal unit for date-time columns", async () => {
    setup({ step: createMockNotebookStep({ query: getJoinedQuery() }) });

    await userEvent.click(screen.getByLabelText("Left column"));
    const popover = await screen.findByTestId("lhs-column-picker");
    const numericColumn = within(popover).getByLabelText("Total");
    const dateTimeColumn = within(popover).getByLabelText("Created At");

    expect(
      within(dateTimeColumn).getByLabelText("Temporal bucket"),
    ).toBeInTheDocument();
    expect(
      within(numericColumn).queryByLabelText("Binning strategy"),
    ).not.toBeInTheDocument();
  });

  it("should handle join operator", async () => {
    const { getRecentJoin } = setup({
      step: createMockNotebookStep({ query: getJoinedQuery() }),
    });

    await userEvent.click(screen.getByLabelText("Change operator"));
    let popover = await screen.findByTestId("select-list");
    let equalsOperator = within(popover).getByLabelText("=");
    let notEqualsOperator = within(popover).getByLabelText("!=");

    expect(equalsOperator).toHaveAttribute("aria-selected", "true");
    expect(notEqualsOperator).toHaveAttribute("aria-selected", "false");

    await userEvent.click(notEqualsOperator);
    await waitFor(() =>
      expect(screen.queryByTestId("select-list")).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByLabelText("Change operator"));
    popover = await screen.findByTestId("select-list");
    equalsOperator = within(popover).getByLabelText("=");
    notEqualsOperator = within(popover).getByLabelText("!=");

    expect(equalsOperator).toHaveAttribute("aria-selected", "false");
    expect(notEqualsOperator).toHaveAttribute("aria-selected", "true");

    const [condition] = getRecentJoin().conditions;
    expect(condition.operator.shortName).toBe("!=");
  });

  describe("join strategies", () => {
    it("should be able to change the join strategy for a new join clause", async () => {
      const { getRecentJoin } = setup();

      await userEvent.click(
        within(screen.getByLabelText("Right table")).getByRole("button"),
      );
      const lhsTableModal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(lhsTableModal).findByText("Reviews"));

      await userEvent.click(screen.getByLabelText("Change join type"));
      const strategyPopover = await screen.findByTestId("select-list");
      await userEvent.click(
        within(strategyPopover).getByLabelText("Right outer join"),
      );

      await userEvent.click(screen.getByLabelText("Left column"));
      const lhsColumnPopover = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPopover).getByText("ID"));

      const rhsColumnPopover = await screen.findByTestId("rhs-column-picker");
      await userEvent.click(within(rhsColumnPopover).getByText("ID"));

      const { strategy } = getRecentJoin();
      expect(strategy.shortName).toBe("right-join");
    });

    it("should be able to change the join strategy of an existing join clause", async () => {
      const { getRecentJoin } = setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
      });

      await userEvent.click(screen.getByLabelText("Change join type"));
      let popover = await screen.findByTestId("select-list");
      let leftJoin = within(popover).getByLabelText("Left outer join");
      let rightJoin = within(popover).getByLabelText("Right outer join");

      expect(leftJoin).toHaveAttribute("aria-selected", "true");
      expect(rightJoin).toHaveAttribute("aria-selected", "false");

      await userEvent.click(rightJoin);
      await waitFor(() =>
        expect(screen.queryByTestId("select-list")).not.toBeInTheDocument(),
      );

      await userEvent.click(screen.getByLabelText("Change join type"));
      popover = await screen.findByTestId("select-list");
      leftJoin = within(popover).getByLabelText("Left outer join");
      rightJoin = within(popover).getByLabelText("Right outer join");

      expect(leftJoin).toHaveAttribute("aria-selected", "false");
      expect(rightJoin).toHaveAttribute("aria-selected", "true");

      const { strategy } = getRecentJoin();
      expect(strategy.shortName).toBe("right-join");
    });

    it("should be able to change the join strategy of an existing join clause after removing the rhs table and selecting join conditions", async () => {
      const { getRecentJoin } = setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
      });

      await userEvent.click(screen.getByLabelText("Change join type"));
      const strategyPopover = await screen.findByTestId("select-list");
      await userEvent.click(
        within(strategyPopover).getByLabelText("Right outer join"),
      );

      await userEvent.click(
        within(screen.getByLabelText("Right table")).getByRole("button", {
          name: /Products/,
        }),
      );
      const lhsTableModal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(lhsTableModal).findByText("Reviews"));

      const lhsColumnPopover = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPopover).getByText("ID"));

      const rhsColumnPopover = await screen.findByTestId("rhs-column-picker");
      await userEvent.click(within(rhsColumnPopover).getByText("ID"));

      const { strategy } = getRecentJoin();
      expect(strategy.shortName).toBe("right-join");
    });
  });

  describe("join fields", () => {
    it("should be 'all' by default", async () => {
      const { getRecentJoin } = setup();

      const modal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(modal).findByText("Products"));

      await waitFor(() => {
        const { fields } = getRecentJoin();
        expect(fields).toBe("all");
      });
    });

    it("should select a few columns when adding a join", async () => {
      const { getRecentJoin } = setup();

      const modal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(modal).findByText("Reviews"));

      await userEvent.click(await screen.findByLabelText("Pick columns"));
      const joinColumnsPicker = await screen.findByTestId(
        "join-columns-picker",
      );

      // Excluding a few columns
      await userEvent.click(within(joinColumnsPicker).getByText("Reviewer"));
      await userEvent.click(within(joinColumnsPicker).getByText("Product ID"));
      await userEvent.click(within(joinColumnsPicker).getByText("Created At"));

      // Bring Reviewer column back
      await userEvent.click(within(joinColumnsPicker).getByText("Reviewer"));

      await userEvent.click(screen.getByLabelText("Left column"));
      const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPicker).getByText("Product ID"));
      await waitFor(() =>
        expect(screen.getByLabelText("Left column")).toHaveTextContent(
          "Product ID",
        ),
      );

      const rhsColumnPicker = await screen.findByTestId("rhs-column-picker");
      await userEvent.click(within(rhsColumnPicker).getByText("Rating"));

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

    it("should allow deselecting the last join column", async () => {
      setup();

      const modal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(modal).findByText("Reviews"));
      await userEvent.click(await screen.findByLabelText("Pick columns"));
      const joinColumnsPicker = await screen.findByTestId(
        "join-columns-picker",
      );
      await userEvent.click(within(joinColumnsPicker).getByText("Select none"));
      expect(within(joinColumnsPicker).getByLabelText("ID")).not.toBeChecked();
      expect(within(joinColumnsPicker).getByLabelText("ID")).toBeEnabled();
      await userEvent.click(within(joinColumnsPicker).getByLabelText("ID"));
      expect(within(joinColumnsPicker).getByLabelText("ID")).toBeChecked();
      expect(within(joinColumnsPicker).getByLabelText("ID")).toBeEnabled();

      await userEvent.click(within(joinColumnsPicker).getByLabelText("ID"));
      expect(within(joinColumnsPicker).getByLabelText("ID")).not.toBeChecked();
      expect(within(joinColumnsPicker).getByLabelText("ID")).toBeEnabled();
    });

    it("should be able to select no columns when adding a new join", async () => {
      const { getRecentJoin } = setup();

      const modal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(modal).findByText("Reviews"));

      await userEvent.click(await screen.findByLabelText("Pick columns"));
      const joinColumnsPicker = await screen.findByTestId(
        "join-columns-picker",
      );

      await userEvent.click(within(joinColumnsPicker).getByText("Select none"));

      await userEvent.click(screen.getByLabelText("Left column"));
      const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPicker).getByText("Product ID"));
      await waitFor(() =>
        expect(screen.getByLabelText("Left column")).toHaveTextContent(
          "Product ID",
        ),
      );

      const rhsColumnPicker = await screen.findByTestId("rhs-column-picker");
      await userEvent.click(within(rhsColumnPicker).getByText("Rating"));

      const { fields } = getRecentJoin();
      expect(fields).toBe("none");
    });

    it("should select a few columns for an existing join", async () => {
      const { getRecentJoin } = setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
      });

      await userEvent.click(screen.getByLabelText("Pick columns"));
      const picker = await screen.findByTestId("join-columns-picker");

      // Excluding a few columns
      await userEvent.click(within(picker).getByText("Vendor"));
      await userEvent.click(within(picker).getByText("Price"));
      await userEvent.click(within(picker).getByText("Category"));

      // Bring Vendors column back
      await userEvent.click(within(picker).getByText("Vendor"));

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
      const { getRecentJoin } = setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
      });

      await userEvent.click(screen.getByLabelText("Pick columns"));
      const picker = await screen.findByTestId("join-columns-picker");
      await userEvent.click(within(picker).getByText("Select none"));

      const { fields } = getRecentJoin();
      expect(fields).toBe("none");
    });
  });

  describe("multiple conditions", () => {
    it("should display a join correctly", () => {
      setup({
        step: createMockNotebookStep({
          query: getJoinedQueryWithMultipleConditions(),
        }),
      });

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

      await userEvent.click(
        within(screen.getByLabelText("Right table")).getByRole("button"),
      );
      const modal = await screen.findByTestId("entity-picker-modal");
      await userEvent.click(await within(modal).findByText("Reviews"));

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();

      const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPicker).getByText("Product ID"));
      await waitFor(() =>
        expect(screen.getByLabelText("Left column")).toHaveTextContent(
          "Product ID",
        ),
      );

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();

      const rhsColumnPicker = await screen.findByTestId("rhs-column-picker");
      await userEvent.click(within(rhsColumnPicker).getByText("Rating"));

      expect(screen.getByLabelText("Add condition")).toBeInTheDocument();
    });

    it("should add a new condition", async () => {
      const { getRecentJoin } = setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
      });

      await userEvent.click(screen.getByLabelText("Add condition"));
      const conditionContainer = screen.getByTestId("new-join-condition");

      const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPicker).getByText("Created At"));
      await waitFor(() =>
        expect(
          within(conditionContainer).getByLabelText("Left column"),
        ).toHaveTextContent("Created At"),
      );

      const rhsColumnPicker = await screen.findByTestId("rhs-column-picker");
      await userEvent.click(within(rhsColumnPicker).getByText("Created At"));

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
      setup({ step: createMockNotebookStep({ query: getJoinedQuery() }) });

      await userEvent.click(screen.getByLabelText("Add condition"));
      let conditionContainer = screen.getByTestId("new-join-condition");

      await userEvent.click(
        within(conditionContainer).getByLabelText("Remove condition"),
      );

      expect(
        screen.queryByTestId("new-join-condition"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Add condition"));
      conditionContainer = screen.getByTestId("new-join-condition");

      const lhsColumnPicker = await screen.findByTestId("lhs-column-picker");
      await userEvent.click(within(lhsColumnPicker).getByText("Created At"));
      await waitFor(() =>
        expect(
          within(conditionContainer).getByLabelText("Left column"),
        ).toHaveTextContent("Created At"),
      );

      await userEvent.click(
        within(conditionContainer).getByLabelText("Remove condition"),
      );
      expect(
        screen.queryByTestId("new-join-condition"),
      ).not.toBeInTheDocument();
    });

    it("should remove a complete condition", async () => {
      const { getRecentJoin } = setup({
        step: createMockNotebookStep({
          query: getJoinedQueryWithMultipleConditions(),
        }),
      });

      let firstCondition = screen.getByTestId("join-condition-0");
      const secondCondition = screen.getByTestId("join-condition-1");

      expect(
        within(firstCondition).getByLabelText("Remove condition"),
      ).toBeInTheDocument();
      expect(
        within(secondCondition).getByLabelText("Remove condition"),
      ).toBeInTheDocument();

      await userEvent.click(
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
      setup({ step: createMockNotebookStep({ query: getJoinedQuery() }) });

      expect(
        screen.queryByLabelText("Remove condition"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Add condition"));

      const firstCondition = screen.getByTestId("join-condition-0");
      expect(
        within(firstCondition).queryByLabelText("Remove condition"),
      ).not.toBeInTheDocument();
    });
  });

  describe("temporal bucket sync", () => {
    async function selectColumnWithBucket(bucketName: string) {
      await userEvent.click(screen.getByLabelText("Temporal bucket"));
      await userEvent.click(screen.getByText("More…"));
      await userEvent.click(screen.getByText(bucketName));
    }

    it.each([
      {
        lhsBucketName: "Don't bin",
        rhsBucketName: "Don't bin",
        expectedColumnName: "Created At",
      },
      {
        lhsBucketName: "Year",
        rhsBucketName: "Don't bin",
        expectedColumnName: "Created At: Year",
      },
      {
        lhsBucketName: "Don't bin",
        rhsBucketName: "Quarter",
        expectedColumnName: "Created At: Quarter",
      },
      {
        lhsBucketName: "Year",
        rhsBucketName: "Month",
        expectedColumnName: "Created At: Year",
      },
    ])(
      "should set the temporal bucket for all columns in a new join condition equal to the first non-empty temporal bucket of the columns",
      async ({ lhsBucketName, rhsBucketName, expectedColumnName }) => {
        const { getRecentJoin } = setup({ step: createMockNotebookStep() });

        const picketModal = await screen.findByTestId("entity-picker-modal");
        await userEvent.click(await within(picketModal).findByText("Reviews"));
        await selectColumnWithBucket(lhsBucketName);
        await selectColumnWithBucket(rhsBucketName);

        const { conditions } = getRecentJoin();
        const [condition] = conditions;
        expect(condition.lhsColumn.displayName).toBe(expectedColumnName);
        expect(condition.rhsColumn.displayName).toBe(expectedColumnName);
      },
    );

    it.each([
      {
        oldBucketName: "Don't bin",
        newLhsBucketName: "Don't bin",
        newRhsBucketName: undefined,
        expectedColumnName: "Created At",
      },
      {
        oldBucketName: "Don't bin",
        newLhsBucketName: undefined,
        newRhsBucketName: "Don't bin",
        expectedColumnName: "Created At",
      },
      {
        oldBucketName: "Don't bin",
        newLhsBucketName: "Year",
        newRhsBucketName: undefined,
        expectedColumnName: "Created At: Year",
      },
      {
        oldBucketName: "Don't bin",
        newLhsBucketName: undefined,
        newRhsBucketName: "Year",
        expectedColumnName: "Created At: Year",
      },
      {
        oldBucketName: "Month",
        newLhsBucketName: "Don't bin",
        newRhsBucketName: undefined,
        expectedColumnName: "Created At",
      },
      {
        oldBucketName: "Month",
        newLhsBucketName: undefined,
        newRhsBucketName: "Don't bin",
        expectedColumnName: "Created At",
      },
      {
        oldBucketName: "Month",
        newLhsBucketName: "Year",
        newRhsBucketName: undefined,
        expectedColumnName: "Created At: Year",
      },
      {
        oldBucketName: "Year",
        newLhsBucketName: undefined,
        newRhsBucketName: "Month",
        expectedColumnName: "Created At: Month",
      },
      {
        oldBucketName: "Month",
        newLhsBucketName: "Year",
        newRhsBucketName: "Quarter",
        expectedColumnName: "Created At: Quarter",
      },
    ])(
      "should set the temporal bucket for all columns in an existing join condition to the temporal bucket of the last selected column",
      async ({
        oldBucketName,
        newLhsBucketName,
        newRhsBucketName,
        expectedColumnName,
      }) => {
        const { getRecentJoin } = setup({ step: createMockNotebookStep() });

        const picketModal = await screen.findByTestId("entity-picker-modal");
        await userEvent.click(await within(picketModal).findByText("Reviews"));
        await selectColumnWithBucket(oldBucketName);
        await selectColumnWithBucket(oldBucketName);

        if (newLhsBucketName) {
          await userEvent.click(screen.getByLabelText("Left column"));
          await selectColumnWithBucket(newLhsBucketName);
        }
        if (newRhsBucketName) {
          await userEvent.click(screen.getByLabelText("Right column"));
          await selectColumnWithBucket(newRhsBucketName);
        }

        const { conditions } = getRecentJoin();
        const [condition] = conditions;
        expect(condition.lhsColumn.displayName).toBe(expectedColumnName);
        expect(condition.rhsColumn.displayName).toBe(expectedColumnName);
      },
    );
  });

  describe("read-only", () => {
    it("shouldn't allow changing the join type", () => {
      setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
        readOnly: true,
      });

      expect(screen.getByLabelText("Change join type")).toBeDisabled();
    });

    it("shouldn't allow changing the operator", () => {
      setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
        readOnly: true,
      });

      expect(screen.getByLabelText("Change operator")).toBeDisabled();
    });

    it("shouldn't allow changing the join fields", () => {
      setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
        readOnly: true,
      });

      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("shouldn't allow changing columns", () => {
      setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
        readOnly: true,
      });

      expect(screen.getByLabelText("Left column")).toBeDisabled();
      expect(screen.getByLabelText("Right column")).toBeDisabled();
    });

    it("shouldn't allow adding a new condition", () => {
      setup({
        step: createMockNotebookStep({ query: getJoinedQuery() }),
        readOnly: true,
      });

      expect(screen.queryByLabelText("Add condition")).not.toBeInTheDocument();
    });

    it("shouldn't allow removing a condition", async () => {
      const query = getJoinedQueryWithMultipleConditions();
      setup({
        step: createMockNotebookStep({ query }),
        readOnly: true,
      });

      expect(
        screen.queryByLabelText("Remove condition"),
      ).not.toBeInTheDocument();
    });
  });
});
