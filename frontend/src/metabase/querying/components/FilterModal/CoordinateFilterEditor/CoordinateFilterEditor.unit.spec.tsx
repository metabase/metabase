import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { CoordinateFilterEditor } from "./CoordinateFilterEditor";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

function setup({ query, stageIndex, column, filter }: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  renderWithProviders(
    <CoordinateFilterEditor
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isSearching={false}
      onChange={onChange}
      onInput={onInput}
    />,
  );

  const getNextFilterName = () => {
    const [nextFilter] = onChange.mock.lastCall;
    return nextFilter
      ? Lib.displayInfo(query, stageIndex, nextFilter).displayName
      : null;
  };

  return { onChange, onInput, getNextFilterName };
}

describe("StringFilterEditor", () => {
  const query = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("PEOPLE", "LATITUDE");

  describe("new filter", () => {
    it("should add a filter with multiple values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Is"));
      await waitForElementToBeRemoved(() => screen.queryByRole("menu"));
      userEvent.type(screen.getByLabelText("Filter value"), "10");
      userEvent.tab();
      userEvent.type(screen.getByLabelText("Filter value"), "20");
      userEvent.tab();

      expect(getNextFilterName()).toBe("Latitude is equal to 2 selections");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Greater than"));
      await waitForElementToBeRemoved(() => screen.queryByRole("menu"));
      userEvent.type(screen.getByPlaceholderText("Enter a number"), "20");
      userEvent.tab();

      expect(getNextFilterName()).toBe("Latitude is greater than 20");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with two values", () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.type(screen.getByPlaceholderText("Min"), "10");
      userEvent.type(screen.getByPlaceholderText("Max"), "20");
      userEvent.tab();

      expect(getNextFilterName()).toBe("Latitude is between 10 and 20");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with four values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Inside"));
      await waitForElementToBeRemoved(() => screen.queryByRole("menu"));
      userEvent.type(screen.getByPlaceholderText("Lower latitude"), "-10");
      userEvent.type(screen.getByPlaceholderText("Upper latitude"), "20");
      userEvent.type(screen.getByPlaceholderText("Left longitude"), "-30");
      userEvent.type(screen.getByPlaceholderText("Right longitude"), "40");
      userEvent.tab();

      expect(getNextFilterName()).toBe(
        "Latitude is between -10 and 20 and Longitude is between -30 and 40",
      );
      expect(onInput).toHaveBeenCalled();
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Greater than"));
      expect(getNextFilterName()).toBeNull();

      userEvent.type(screen.getByPlaceholderText("Enter a number"), "10");
      userEvent.clear(screen.getByPlaceholderText("Enter a number"));
      expect(getNextFilterName()).toBeNull();
    });

    it("should coerce invalid filter values", () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.type(screen.getByPlaceholderText("Min"), "10");
      userEvent.tab();

      expect(getNextFilterName()).toBe(
        "Latitude is greater than or equal to 10",
      );
      expect(onInput).toHaveBeenCalled();
    });
  });

  describe("existing filter", () => {
    it("should update a filter with multiple values", () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "=",
        values: [10],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByDisplayValue("10")).toBeInTheDocument();

      userEvent.type(screen.getByLabelText("Filter value"), "20");
      userEvent.tab();

      expect(getNextFilterName()).toBe("Latitude is equal to 2 selections");
    });

    it("should update a filter with one value", () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: ">",
        values: [10],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      userEvent.clear(screen.getByDisplayValue("10"));
      userEvent.type(screen.getByPlaceholderText("Enter a number"), "20");
      userEvent.tab();

      expect(getNextFilterName()).toBe("Latitude is greater than 20");
    });

    it("should update a filter with two values", () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "between",
        values: [10, 20],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      userEvent.clear(screen.getByDisplayValue("10"));
      userEvent.type(screen.getByPlaceholderText("Min"), "15");
      userEvent.clear(screen.getByDisplayValue("20"));
      userEvent.type(screen.getByPlaceholderText("Max"), "25");
      userEvent.tab();

      expect(getNextFilterName()).toBe("Latitude is between 15 and 25");
    });

    it("should update a filter with four values", () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "inside",
        values: [20, -30, -10, 40],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      userEvent.clear(screen.getByDisplayValue("-10"));
      userEvent.type(screen.getByPlaceholderText("Lower latitude"), "-11");
      userEvent.clear(screen.getByDisplayValue("20"));
      userEvent.type(screen.getByPlaceholderText("Upper latitude"), "22");
      userEvent.clear(screen.getByDisplayValue("-30"));
      userEvent.type(screen.getByPlaceholderText("Left longitude"), "-33");
      userEvent.clear(screen.getByDisplayValue("40"));
      userEvent.type(screen.getByPlaceholderText("Right longitude"), "44");
      userEvent.tab();

      expect(getNextFilterName()).toBe(
        "Latitude is between -11 and 22 and Longitude is between -33 and 44",
      );
    });
  });
});

interface QueryWithFilterOpts {
  operator: Lib.CoordinateFilterOperatorName;
  values: number[];
}

function createQueryWithFilter({ operator, values }: QueryWithFilterOpts) {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const findColumn = columnFinder(
    defaultQuery,
    Lib.filterableColumns(defaultQuery, stageIndex),
  );
  const latitudeColumn = findColumn("PEOPLE", "LATITUDE");
  const longitudeColumn = findColumn("PEOPLE", "LONGITUDE");
  const query = Lib.filter(
    defaultQuery,
    stageIndex,
    Lib.coordinateFilterClause({
      operator,
      column: latitudeColumn,
      longitudeColumn,
      values,
    }),
  );
  const [filter] = Lib.filters(query, stageIndex);

  return { query, stageIndex, column: latitudeColumn, filter };
}
