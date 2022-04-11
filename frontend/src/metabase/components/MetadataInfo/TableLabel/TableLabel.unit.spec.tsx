import React from "react";
import { render, screen } from "@testing-library/react";

import Table from "metabase-lib/lib/metadata/Table";
import TableLabel from "./TableLabel";

describe("TableLabel", () => {
  beforeEach(() => {
    render(<TableLabel table={new Table({ id: 1, display_name: "Foo" })} />);
  });

  it("should display the given table's display name", () => {
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });
});
