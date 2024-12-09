import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { ColumnFilterSection } from "./ColumnFilterSection";

const TABLE = createMockTable({
  fields: [
    createMockField({
      id: 1,
      name: "BOOLEAN",
      display_name: "Boolean",
      base_type: "type/Boolean",
      effective_type: "type/Boolean",
    }),
    createMockField({
      id: 2,
      name: "TIME",
      display_name: "Time",
      base_type: "type/Time",
      effective_type: "type/Time",
    }),
    createMockField({
      id: 3,
      name: "DATE",
      display_name: "Date",
      base_type: "type/Date",
      effective_type: "type/DateTime",
    }),
    createMockField({
      id: 4,
      name: "DATETIME",
      display_name: "DateTime",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
    }),
    createMockField({
      id: 5,
      name: "LATITUDE",
      display_name: "Latitude",
      base_type: "type/Float",
      effective_type: "type/Float",
      semantic_type: "type/Latitude",
    }),
    createMockField({
      id: 6,
      name: "NUMBER",
      display_name: "Number",
      base_type: "type/Float",
      effective_type: "type/Float",
    }),
    createMockField({
      id: 7,
      name: "TEXT",
      display_name: "Text",
      base_type: "type/Text",
      effective_type: "type/Text",
    }),
    createMockField({
      id: 8,
      name: "ENUM",
      display_name: "Enum",
      base_type: "type/PostgresEnum",
      effective_type: "type/PostgresEnum",
    }),
    createMockField({
      id: 9,
      name: "INTERVAL",
      display_name: "Interval",
      base_type: "type/Interval",
      effective_type: "type/Interval",
    }),
    createMockField({
      id: 10,
      name: "ARRAY",
      display_name: "Array",
      base_type: "type/Array",
      effective_type: "type/Array",
    }),
    createMockField({
      id: 11,
      name: "UNKNOWN",
      display_name: "Unknown",
      base_type: "type/*",
      effective_type: "type/*",
    }),
  ],
});

const DATABASE = createMockDatabase({
  tables: [TABLE],
});

const METADATA = createMockMetadata({
  databases: [DATABASE],
});

type SetupOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isSearching?: boolean;
};

function setup({
  query,
  stageIndex,
  column,
  filter,
  isSearching = false,
}: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  renderWithProviders(
    <ColumnFilterSection
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isSearching={isSearching}
      onChange={onChange}
      onInput={onInput}
    />,
  );

  return { onChange };
}

describe("ColumnFilterSection", () => {
  const provider = Lib.metadataProvider(DATABASE.id, METADATA);
  const table = Lib.tableOrCardMetadata(provider, TABLE.id);
  const query = Lib.queryFromTableOrCardMetadata(provider, table);
  const stageIndex = 0;
  const columns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, columns);

  it.each([
    { columnName: "BOOLEAN", testId: "boolean-filter-editor" },
    { columnName: "TIME", testId: "time-filter-editor" },
    { columnName: "DATE", testId: "date-filter-editor" },
    { columnName: "DATETIME", testId: "date-filter-editor" },
    { columnName: "LATITUDE", testId: "coordinate-filter-editor" },
    { columnName: "NUMBER", testId: "number-filter-editor" },
    { columnName: "TEXT", testId: "string-filter-editor" },
    { columnName: "ENUM", testId: "string-filter-editor" },
    { columnName: "INTERVAL", testId: "default-filter-editor" },
    { columnName: "ARRAY", testId: "default-filter-editor" },
    { columnName: "UNKNOWN", testId: "default-filter-editor" },
  ])("should render $testId for $columnName", ({ columnName, testId }) => {
    setup({ query, stageIndex, column: findColumn(TABLE.name, columnName) });
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });
});
