import React from "react";
import { render, screen } from "@testing-library/react";

import Table from "metabase-lib/metadata/Table";
import TableLabel from "./TableLabel";

describe("TableLabel", () => {
  it("should display the given table's display name", () => {
    render(<TableLabel table={new Table({ id: 1, display_name: "Foo" })} />);
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });
});
