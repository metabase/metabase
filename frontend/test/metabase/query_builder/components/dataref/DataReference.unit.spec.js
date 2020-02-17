import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import DataReference from "metabase/query_builder/components/dataref/DataReference";
import { makeMetadata } from "__support__/sample_dataset_fixture";

const metadata = makeMetadata({
  databases: {
    1: {
      name: "db1",
      tables: [1, 2, 3],
    },
    2: {
      name: "db2",
      tables: [4],
    },
    3: {
      name: "saved questions",
      tables: [5],
      is_saved_questions: true,
    },
  },
  schemas: {
    "1:s1": { name: "s1" },
    "1:s2": { name: "s2" },
    "2:": { name: "" },
    "3:": { name: "" },
  },
  tables: {
    1: { name: "t1", id: 1, schema: "1:s1", schema_name: "s1" },
    2: { name: "t2", id: 2, schema: "1:s2", schema_name: "s2" },
    3: {
      name: "t3",
      id: 3,
      schema: "1:s2",
      schema_name: "s3",
      visibility_type: "hidden",
    },
    4: { name: "t4", id: 4, schema: "2:" },
    5: { name: "t5", id: 5, schema: "3:" },
  },
});

const databases = Object.values(metadata.databases);

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
