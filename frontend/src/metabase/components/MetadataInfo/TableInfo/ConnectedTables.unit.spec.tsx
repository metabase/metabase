import React from "react";
import { render, screen } from "@testing-library/react";

import Table from "metabase-lib/metadata/Table";

import ConnectedTables from "./ConnectedTables";

function setup(table: Table) {
  return render(<ConnectedTables table={table} />);
}

describe("ConnectedTables", () => {
  it("should show nothing when the table has no fks", () => {
    const table = new Table();
    const { container } = setup(table);

    expect(container).toBeEmptyDOMElement();
  });

  it("should show a label for each connected table", () => {
    const table = new Table({
      id: 1,
      db_id: 2,
      fks: [
        {
          origin: {
            table: {
              id: 2,
              db_id: 2,
              display_name: "Foo",
            },
          },
        },
        {
          origin: {
            table: {
              id: 3,
              db_id: 2,
              display_name: "Bar",
            },
          },
        },
      ],
    });

    setup(table);

    expect(screen.getByText("Foo")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });
});
