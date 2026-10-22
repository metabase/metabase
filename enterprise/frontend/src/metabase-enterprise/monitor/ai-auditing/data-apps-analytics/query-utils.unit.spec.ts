import { createMockMetadata } from "__support__/metadata";
import type { DateFilterValue } from "metabase/querying/common/types";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  buildDataAppLogCountQuery,
  getMissingDataAppLogColumns,
} from "./query-utils";

const DATABASE_ID = 13371337;
const TABLE_ID = 3001;

const DATE_FILTER: DateFilterValue = {
  type: "relative",
  value: -30,
  unit: "day",
  options: { includeCurrent: true },
};

const ALL_COLUMNS = [
  { name: "embedding_client", type: "type/Text" },
  { name: "embedding_client_identifier", type: "type/Text" },
  { name: "action_id", type: "type/Integer" },
  { name: "started_at", type: "type/DateTimeWithLocalTZ" },
  { name: "user_id", type: "type/Integer" },
];

function getQueryLogSource(columnNames: string[]) {
  const table = createMockTable({
    id: TABLE_ID,
    db_id: DATABASE_ID,
    name: "v_query_log",
    fields: ALL_COLUMNS.filter((column) =>
      columnNames.includes(column.name),
    ).map((column, index) =>
      createMockField({
        id: TABLE_ID * 100 + index,
        table_id: TABLE_ID,
        name: column.name,
        display_name: column.name,
        base_type: column.type,
        effective_type: column.type,
      }),
    ),
  });
  const metadata = createMockMetadata({
    databases: [createMockDatabase({ id: DATABASE_ID, tables: [table] })],
  });
  const provider = createMetadataProvider({
    databaseId: DATABASE_ID,
    metadata,
  });
  return {
    provider,
    table: checkNotNull(Lib.tableOrCardMetadata(provider, TABLE_ID)),
  };
}

const allColumnNames = ALL_COLUMNS.map((column) => column.name);

describe("getMissingDataAppLogColumns", () => {
  it("names the columns the page filters on that the view lacks", () => {
    const source = getQueryLogSource(
      allColumnNames.filter(
        (name) => name !== "embedding_client" && name !== "action_id",
      ),
    );

    expect(getMissingDataAppLogColumns(source)).toEqual([
      "embedding_client",
      "action_id",
    ]);
  });

  it("names none when the view has them all", () => {
    expect(
      getMissingDataAppLogColumns(getQueryLogSource(allColumnNames)),
    ).toEqual([]);
  });
});

describe("buildDataAppLogCountQuery", () => {
  it("throws rather than leave out the filter that scopes the log to data apps", () => {
    const source = getQueryLogSource(
      allColumnNames.filter((name) => name !== "embedding_client"),
    );

    expect(() =>
      buildDataAppLogCountQuery({ ...source, dateFilter: DATE_FILTER }),
    ).toThrow("embedding_client");
  });

  it("throws rather than leave out the entity type filter", () => {
    const source = getQueryLogSource(
      allColumnNames.filter((name) => name !== "action_id"),
    );

    expect(() =>
      buildDataAppLogCountQuery({
        ...source,
        dateFilter: DATE_FILTER,
        entityType: "action",
      }),
    ).toThrow("action_id");
  });
});
