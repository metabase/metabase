import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";

import { DataStep } from "./DataStep";

const createQueryWithFields = (columnNames: string[]) => {
  const query = createQuery();
  const findColumn = columnFinder(query, Lib.fieldableColumns(query, 0));
  const columns = columnNames.map(name => findColumn("ORDERS", name));
  return Lib.withFields(query, 0, columns);
};

const createQueryWithAggregation = () => {
  const query = createQuery();
  const count = findAggregationOperator(query, "count");
  const aggregation = Lib.aggregationClause(count);
  return Lib.aggregate(query, 0, aggregation);
};

const createQueryWithBreakout = () => {
  const query = createQuery();
  const columns = Lib.breakoutableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const column = findColumn("ORDERS", "TAX");
  return Lib.breakout(query, 0, column);
};

const setup = async (
  step = createMockNotebookStep(),
  { readOnly = false }: { readOnly?: boolean } = {},
) => {
  const updateQuery = jest.fn();
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);

  renderWithProviders(
    <DataStep
      step={step}
      query={step.query}
      stageIndex={step.stageIndex}
      readOnly={readOnly}
      color="brand"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  const getNextQuery = (): Lib.Query => {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  };

  const getNextTableName = () => {
    const query = getNextQuery();
    const [sampleColumn] = Lib.visibleColumns(query, 0);
    return Lib.displayInfo(query, 0, sampleColumn).table?.displayName;
  };

  const getNextColumn = (columnName: string) => {
    const nextQuery = getNextQuery();
    const nextFields = Lib.fieldableColumns(nextQuery, 0);
    const findColumn = columnFinder(nextQuery, nextFields);
    const column = findColumn("ORDERS", columnName);
    return Lib.displayInfo(nextQuery, 0, column);
  };

  await screen.findByText("Orders");

  return { getNextQuery, getNextTableName, getNextColumn };
};

const setupEmptyQuery = () => {
  const question = Question.create({ databaseId: SAMPLE_DB_ID });
  const query = question.query();
  return setup(createMockNotebookStep({ query }));
};

describe("DataStep", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    HTMLElement.prototype.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ height: 1, width: 1 });
  });

  afterAll(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;

    jest.resetAllMocks();
  });

  it("should render without a table selected", async () => {
    await setupEmptyQuery();

    const modal = await screen.findByTestId("entity-picker-modal");
    expect(
      within(modal).getByText("Pick your starting data"),
    ).toBeInTheDocument();

    // Ensure the table picker not open
    expect(within(modal).getByText("Orders")).toBeInTheDocument();
    expect(within(modal).getByText("Products")).toBeInTheDocument();
    expect(within(modal).getByText("People")).toBeInTheDocument();
  });

  it("should render with a selected table", async () => {
    await setup();

    expect(screen.getByText("Orders")).toBeInTheDocument();

    expect(
      screen.queryByText("Pick your starting data"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
    expect(screen.queryByText("Products")).not.toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it("should change a table", async () => {
    const { getNextTableName } = await setup();

    await userEvent.click(screen.getByText("Orders"));
    await userEvent.click(await screen.findByText("Products"));

    expect(getNextTableName()).toBe("Products");
  });

  describe("fields selection", () => {
    it("should render with all columns selected", async () => {
      await setup();
      await userEvent.click(screen.getByLabelText("Pick columns"));

      expect(screen.getByLabelText("Select none")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeEnabled();
      expect(screen.getByLabelText("Tax")).toBeChecked();
      expect(screen.getByLabelText("Tax")).toBeEnabled();
    });

    it("should render with a single column selected", async () => {
      const query = createQueryWithFields(["ID"]);
      await setup(createMockNotebookStep({ query }));
      await userEvent.click(screen.getByLabelText("Pick columns"));

      expect(screen.getByLabelText("Select all")).not.toBeChecked();
      expect(screen.getByLabelText("ID")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeDisabled();
      expect(screen.getByLabelText("Tax")).not.toBeChecked();
      expect(screen.getByLabelText("Tax")).toBeEnabled();
    });

    it("should render with multiple columns selected", async () => {
      const query = createQueryWithFields(["ID", "TOTAL"]);
      await setup(createMockNotebookStep({ query }));
      await userEvent.click(screen.getByLabelText("Pick columns"));

      expect(screen.getByLabelText("Select all")).not.toBeChecked();
      expect(screen.getByLabelText("ID")).toBeChecked();
      expect(screen.getByLabelText("ID")).toBeEnabled();
      expect(screen.getByLabelText("Tax")).not.toBeChecked();
      expect(screen.getByLabelText("Tax")).toBeEnabled();
      expect(screen.getByLabelText("Total")).toBeChecked();
      expect(screen.getByLabelText("Total")).toBeEnabled();
    });

    it("should allow selecting a column", async () => {
      const query = createQueryWithFields(["ID"]);
      const step = createMockNotebookStep({ query });
      const { getNextColumn } = await setup(step);

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Tax"));

      expect(getNextColumn("ID").selected).toBeTruthy();
      expect(getNextColumn("TAX").selected).toBeTruthy();
      expect(getNextColumn("TOTAL").selected).toBeFalsy();
    });

    it("should allow de-selecting a column", async () => {
      const { getNextColumn } = await setup();

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Tax"));

      expect(getNextColumn("ID").selected).toBeTruthy();
      expect(getNextColumn("TAX").selected).toBeFalsy();
      expect(getNextColumn("TOTAL").selected).toBeTruthy();
    });

    it("should allow selecting all columns", async () => {
      const query = createQueryWithFields(["ID"]);
      const step = createMockNotebookStep({ query });
      const { getNextColumn } = await setup(step);

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Select all"));

      expect(getNextColumn("ID").selected).toBeTruthy();
      expect(getNextColumn("TAX").selected).toBeTruthy();
      expect(getNextColumn("TOTAL").selected).toBeTruthy();
    });

    it("should leave one column when de-selecting all columns", async () => {
      const { getNextQuery } = await setup();

      await userEvent.click(screen.getByLabelText("Pick columns"));
      await userEvent.click(screen.getByLabelText("Select none"));

      const nextQuery = getNextQuery();
      expect(Lib.fields(nextQuery, 0)).toHaveLength(1);
    });

    it("should not display fields picker in read-only mode", async () => {
      await setup(createMockNotebookStep(), { readOnly: true });
      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("should not display fields picker until a table is selected", async () => {
      await setupEmptyQuery();
      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("should not display fields picker if a query has aggregations", () => {
      const query = createQueryWithAggregation();
      const step = createMockNotebookStep({ query });
      setup(step);

      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });

    it("should not display fields picker if a query has breakouts", () => {
      const query = createQueryWithBreakout();
      const step = createMockNotebookStep({ query });
      setup(step);

      expect(screen.queryByLabelText("Pick columns")).not.toBeInTheDocument();
    });
  });
});
