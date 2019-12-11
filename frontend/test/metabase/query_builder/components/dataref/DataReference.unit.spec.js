import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import DataReference from "metabase/query_builder/components/dataref/DataReference";

const databases = [
  {
    name: "db1",
    id: 1,
    tables: [
      { name: "t1", id: 1, schema: "s1" },
      { name: "t2", id: 2, schema: "s2" },
      { name: "t3", id: 3, schema: "s2", visibility_type: "hidden" },
    ],
  },
  { name: "db2", id: 2, tables: [{ name: "t4", id: 4 }] },
  {
    name: "saved questions",
    is_saved_questions: true,
    tables: [{ name: "t5", id: 5 }],
  },
  { name: "empty", tables: [] },
];

describe("DatabasePane", () => {
  afterEach(cleanup);

  it("should show databases except empty databases and saved questions db", () => {
    const { getByText, queryByText } = render(
      <DataReference databases={databases} />,
    );
    getByText("db1");
    getByText("db2");
    expect(queryByText("saved questions")).toBe(null);
    expect(queryByText("empty")).toBe(null);
  });

  it("should show tables in db without multple schemas", () => {
    const { getByText } = render(<DataReference databases={databases} />);
    fireEvent.click(getByText("db2"));
    getByText("t4");
  });

  it("should show schemas in db with multple schemas", () => {
    const { getByText } = render(<DataReference databases={databases} />);
    fireEvent.click(getByText("db1"));
    getByText("s1");
    getByText("s2");
  });

  it("should only show visible tables", () => {
    const { getByText, queryByText } = render(
      <DataReference databases={databases} />,
    );
    fireEvent.click(getByText("db1"));
    fireEvent.click(getByText("s2"));
    getByText("1"); // table count with filtered tables
    getByText("t2");
    expect(queryByText("t3")).toBe(null);
  });
});
