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

import { DefaultFilterEditor } from "./DefaultFilterEditor";

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
    <DefaultFilterEditor
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

const UNKNOWN_FIELD = createMockField({
  id: 102,
  table_id: ORDERS_ID,
  name: "UNKNOWN",
  display_name: "Unknown",
  base_type: "type/*",
  effective_type: "type/*",
  semantic_type: null,
});

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [createOrdersIdField(), UNKNOWN_FIELD],
        }),
      ],
    }),
  ],
});

describe("DefaultFilterEditor", () => {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("ORDERS", UNKNOWN_FIELD.name);

  describe("new filter", () => {
    it('should add a "is-null" filter', async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });
      const isEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Is empty",
      });
      const notEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Not empty",
      });
      expect(isEmptyCheckbox).not.toBeChecked();
      expect(notEmptyCheckbox).not.toBeChecked();

      await userEvent.click(isEmptyCheckbox);
      expect(getNextFilterName()).toBe(
        `${UNKNOWN_FIELD.display_name} is empty`,
      );
      expect(isEmptyCheckbox).toBeChecked();
      expect(notEmptyCheckbox).not.toBeChecked();
    });

    it('should add a "not-null" filter', async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      const isEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Is empty",
      });
      const notEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Not empty",
      });
      await userEvent.click(notEmptyCheckbox);

      expect(getNextFilterName()).toBe(
        `${UNKNOWN_FIELD.display_name} is not empty`,
      );
      expect(isEmptyCheckbox).not.toBeChecked();
      expect(notEmptyCheckbox).toBeChecked();
    });

    it("should allow to remove a filter", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      const isEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Is empty",
      });
      const notEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Not empty",
      });
      await userEvent.click(isEmptyCheckbox);
      expect(getNextFilterName()).toBe(
        `${UNKNOWN_FIELD.display_name} is empty`,
      );
      expect(isEmptyCheckbox).toBeChecked();
      expect(notEmptyCheckbox).not.toBeChecked();

      await userEvent.click(isEmptyCheckbox);
      expect(getNextFilterName()).toBeNull();
      expect(isEmptyCheckbox).not.toBeChecked();
      expect(notEmptyCheckbox).not.toBeChecked();

      await userEvent.click(notEmptyCheckbox);
      expect(getNextFilterName()).toBe(
        `${UNKNOWN_FIELD.display_name} is not empty`,
      );
      expect(isEmptyCheckbox).not.toBeChecked();
      expect(notEmptyCheckbox).toBeChecked();

      await userEvent.click(notEmptyCheckbox);
      expect(getNextFilterName()).toBeNull();
      expect(isEmptyCheckbox).not.toBeChecked();
      expect(notEmptyCheckbox).not.toBeChecked();
    });
  });

  describe("existing filter", () => {
    it("should update a filter", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "is-null",
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      const isEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Is empty",
      });
      const notEmptyCheckbox = screen.getByRole("checkbox", {
        name: "Not empty",
      });
      expect(isEmptyCheckbox).toBeChecked();
      expect(notEmptyCheckbox).not.toBeChecked();

      await userEvent.click(notEmptyCheckbox);
      expect(getNextFilterName()).toBe(
        `${UNKNOWN_FIELD.display_name} is not empty`,
      );
      expect(isEmptyCheckbox).not.toBeChecked();
      expect(notEmptyCheckbox).toBeChecked();
    });
  });
});

interface QueryWithFilterOpts {
  operator: Lib.DefaultFilterOperatorName;
}

function createQueryWithFilter({ operator }: QueryWithFilterOpts) {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const findColumn = columnFinder(
    defaultQuery,
    Lib.filterableColumns(defaultQuery, stageIndex),
  );
  const column = findColumn("ORDERS", UNKNOWN_FIELD.name);
  const query = Lib.filter(
    defaultQuery,
    stageIndex,
    Lib.defaultFilterClause({
      operator,
      column,
    }),
  );
  const [filter] = Lib.filters(query, stageIndex);
  return { query, stageIndex, column, filter };
}
