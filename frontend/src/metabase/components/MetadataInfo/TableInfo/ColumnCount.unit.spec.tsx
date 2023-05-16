import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import type Table from "metabase-lib/metadata/Table";
import ColumnCount from "./ColumnCount";

const DB_ID = 1;

const rawTableWithOneField = createMockTable({
  id: 1,
  db_id: DB_ID,
  fields: [createMockField({ id: 1, table_id: 1 })],
});

const rawTableWithFewFields = createMockTable({
  id: 2,
  db_id: DB_ID,
  fields: [
    createMockField({ id: 2, table_id: 2 }),
    createMockField({ id: 3, table_id: 2 }),
  ],
});

const rawTableWithoutFields = createMockTable({
  id: 3,
  db_id: DB_ID,
  fields: undefined,
});

const metadata = createMockMetadata({
  databases: [
    createMockDatabase({
      id: DB_ID,
      tables: [
        rawTableWithOneField,
        rawTableWithFewFields,
        rawTableWithoutFields,
      ],
    }),
  ],
});

const tableWithOneField = checkNotNull(metadata.table(rawTableWithOneField.id));
const tableWithFewFields = checkNotNull(
  metadata.table(rawTableWithFewFields.id),
);
const tableWithoutFields = checkNotNull(
  metadata.table(rawTableWithoutFields.id),
);

function setup(table: Table) {
  return render(<ColumnCount table={table} />);
}

describe("ColumnCount", () => {
  it("should show a non-plural label for a table with a single field", () => {
    setup(tableWithOneField);
    expect(screen.getByText("1 column")).toBeInTheDocument();
  });

  it("should show a plural label for a table with multiple fields", () => {
    setup(tableWithFewFields);
    expect(screen.getByText("2 columns")).toBeInTheDocument();
  });

  it("should handle a scenario where a table has no fields property", () => {
    setup(tableWithoutFields);
    expect(screen.getByText("0 columns")).toBeInTheDocument();
  });
});
