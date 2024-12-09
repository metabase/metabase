import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { FilterPickerBody } from "./FilterPickerBody";

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
  isNew?: boolean;
};

function setup({
  query,
  stageIndex,
  column,
  filter,
  isNew = false,
}: SetupOpts) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <FilterPickerBody
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isNew={isNew}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  return { onChange, onBack };
}

describe("FilterPickerBody", () => {
  const provider = Lib.metadataProvider(DATABASE.id, METADATA);
  const table = Lib.tableOrCardMetadata(provider, TABLE.id);
  const query = Lib.queryFromTableOrCardMetadata(provider, table);
  const stageIndex = 0;
  const columns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, columns);

  it.each([
    { columnName: "BOOLEAN", testId: "boolean-filter-picker" },
    { columnName: "TIME", testId: "time-filter-picker" },
    { columnName: "DATE", testId: "date-filter-picker" },
    { columnName: "DATETIME", testId: "date-filter-picker" },
    { columnName: "LATITUDE", testId: "coordinate-filter-picker" },
    { columnName: "NUMBER", testId: "number-filter-picker" },
    { columnName: "TEXT", testId: "string-filter-picker" },
    { columnName: "ENUM", testId: "string-filter-picker" },
    { columnName: "INTERVAL", testId: "default-filter-picker" },
    { columnName: "UNKNOWN", testId: "default-filter-picker" },
  ])("should render $testId for $columnName", ({ columnName, testId }) => {
    setup({ query, stageIndex, column: findColumn(TABLE.name, columnName) });
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });
});
