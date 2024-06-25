import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import { BooleanFilterEditor } from "./BooleanFilterEditor";

const BOOLEAN_FIELD = createMockField({
  id: 102,
  table_id: ORDERS_ID,
  name: "IS_TRIAL",
  display_name: "Is trial",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
  semantic_type: "type/Category",
});

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [createOrdersIdField(), BOOLEAN_FIELD],
        }),
      ],
    }),
  ],
});

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
    <BooleanFilterEditor
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

describe("BooleanFilterEditor", () => {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("ORDERS", BOOLEAN_FIELD.name);

  describe("new filter", () => {
    it('should add a "true" filter', async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      const trueCheckbox = screen.getByRole("checkbox", { name: "True" });
      const falseCheckbox = screen.getByRole("checkbox", { name: "False" });
      await userEvent.click(trueCheckbox);

      expect(getNextFilterName()).toBe("Is trial is true");
      expect(trueCheckbox).toBeChecked();
      expect(falseCheckbox).not.toBeChecked();
      expect(screen.queryByText("is")).not.toBeInTheDocument();
    });

    it('should add a "false" filter', async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      const trueCheckbox = screen.getByRole("checkbox", { name: "True" });
      const falseCheckbox = screen.getByRole("checkbox", { name: "False" });
      await userEvent.click(falseCheckbox);

      expect(getNextFilterName()).toBe("Is trial is false");
      expect(trueCheckbox).not.toBeChecked();
      expect(falseCheckbox).toBeChecked();
      expect(screen.queryByText("is")).not.toBeInTheDocument();
    });

    it("should allow to remove a filter", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      const trueCheckbox = screen.getByRole("checkbox", { name: "True" });
      const falseCheckbox = screen.getByRole("checkbox", { name: "False" });
      await userEvent.click(trueCheckbox);
      expect(getNextFilterName()).toBe("Is trial is true");
      expect(trueCheckbox).toBeChecked();
      expect(falseCheckbox).not.toBeChecked();

      await userEvent.click(trueCheckbox);
      expect(getNextFilterName()).toBeNull();
      expect(trueCheckbox).not.toBeChecked();
      expect(falseCheckbox).not.toBeChecked();

      await userEvent.click(falseCheckbox);
      expect(getNextFilterName()).toBe("Is trial is false");
      expect(trueCheckbox).not.toBeChecked();
      expect(falseCheckbox).toBeChecked();

      await userEvent.click(falseCheckbox);
      expect(getNextFilterName()).toBeNull();
      expect(trueCheckbox).not.toBeChecked();
      expect(falseCheckbox).not.toBeChecked();
    });
  });

  describe("existing filter", () => {
    it("should update a filter with one value", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "=",
        values: [true],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      const trueCheckbox = screen.getByRole("checkbox", { name: "True" });
      const falseCheckbox = screen.getByRole("checkbox", { name: "False" });
      expect(trueCheckbox).toBeChecked();
      expect(falseCheckbox).not.toBeChecked();

      await userEvent.click(falseCheckbox);
      expect(getNextFilterName()).toBe("Is trial is false");
      expect(trueCheckbox).not.toBeChecked();
      expect(falseCheckbox).toBeChecked();
    });

    it("should update a filter with no values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "is-null",
        values: [],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      const trueCheckbox = screen.getByRole("checkbox", { name: "True" });
      const falseCheckbox = screen.getByRole("checkbox", { name: "False" });
      expect(screen.getByText("is empty")).toBeInTheDocument();
      expect(trueCheckbox).not.toBeChecked();
      expect(falseCheckbox).not.toBeChecked();

      await userEvent.click(screen.getByText("is empty"));
      await userEvent.click(await screen.findByText("Not empty"));
      expect(getNextFilterName()).toBe("Is trial is not empty");
      expect(screen.getByText("not empty")).toBeInTheDocument();
      expect(
        await screen.findByRole("checkbox", { name: "True" }),
      ).not.toBeChecked();
      expect(falseCheckbox).not.toBeChecked();

      await userEvent.click(screen.getByText("not empty"));
      await userEvent.click(await screen.findByText("Is"));
      await userEvent.click(
        await screen.findByRole("checkbox", { name: "True" }),
      );
      expect(getNextFilterName()).toBe("Is trial is true");
      expect(screen.getByText("is")).toBeInTheDocument();
      expect(trueCheckbox).toBeChecked();
      expect(falseCheckbox).not.toBeChecked();
    });
  });
});

interface QueryWithFilterOpts {
  operator: Lib.BooleanFilterOperatorName;
  values: boolean[];
}

function createQueryWithFilter({ operator, values }: QueryWithFilterOpts) {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const findColumn = columnFinder(
    defaultQuery,
    Lib.filterableColumns(defaultQuery, stageIndex),
  );
  const column = findColumn("ORDERS", BOOLEAN_FIELD.name);
  const query = Lib.filter(
    defaultQuery,
    stageIndex,
    Lib.booleanFilterClause({
      operator,
      column,
      values,
    }),
  );
  const [filter] = Lib.filters(query, stageIndex);

  return { query, stageIndex, column, filter };
}
