import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import TableLabel from "./TableLabel";

const metadata = createMockMetadata({
  databases: [
    createMockDatabase({
      id: 1,
      tables: [createMockTable({ id: 1, db_id: 1, display_name: "Foo" })],
    }),
  ],
});

const table = checkNotNull(metadata.table(1));

describe("TableLabel", () => {
  it("should display the given table's display name", () => {
    render(<TableLabel table={table} />);
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });
});
