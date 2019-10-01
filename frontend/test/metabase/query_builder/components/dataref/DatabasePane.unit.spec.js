import React from "react";
import { render, cleanup } from "@testing-library/react";
import DatabasePane from "metabase/query_builder/components/dataref/DatabasePane";

describe("DatabasePane", () => {
  afterEach(cleanup);

  it("should render schema names", () => {
    const tables = [
      { schema: "foo", name: "t1" },
      { schema: "bar", name: "t2" },
      { schema: "foo", name: "t3" },
    ];
    const { getByText } = render(<DatabasePane database={{ tables }} />);
    getByText("foo");
    getByText("bar");
  });

  it("shouldn't render schema names if there's only one", () => {
    const tables = [
      { schema: "foo", name: "t1" },
      { schema: "foo", name: "t2" },
    ];
    const { queryByText } = render(<DatabasePane database={{ tables }} />);
    expect(queryByText("foo")).toBe(null);
  });

  it("shouldn't render hidden tables", () => {
    const tables = [
      { schema: "foo", name: "t1", visibility_type: "hidden" },
      { schema: "foo", name: "t2" },
    ];
    const { queryByText } = render(<DatabasePane database={{ tables }} />);
    expect(queryByText("t1")).toBe(null);
    expect(queryByText("foo")).toBe(null);
  });
});
