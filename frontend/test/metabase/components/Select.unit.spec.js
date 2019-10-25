import React from "react";
import { render, cleanup } from "@testing-library/react";

import Select, { Option } from "metabase/components/Select";

describe("Select", () => {
  afterEach(cleanup);

  it("should render selected option", () => {
    const { getByText, queryByText } = render(
      <Select value="b">
        <Option value="a">option a</Option>
        <Option value="b">option b</Option>
      </Select>,
    );

    expect(queryByText("option a")).toBe(null);
    getByText("option b");
  });

  it("should render the defaultValue if none is selected", () => {
    const { getByText, queryByText } = render(
      <Select defaultValue="b">
        <Option value="a">option a</Option>
        <Option value="b">option b</Option>
      </Select>,
    );

    expect(queryByText("option a")).toBe(null);
    getByText("option b");
  });

  it("should render a placeholder if none is selected", () => {
    const { getByText, queryByText } = render(
      <Select placeholder="choose an option">
        <Option value="a">option a</Option>
        <Option value="b">option b</Option>
      </Select>,
    );

    expect(queryByText("option a")).toBe(null);
    expect(queryByText("option b")).toBe(null);
    getByText("choose an option");
  });
});
