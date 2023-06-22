import { render, screen } from "@testing-library/react";

import Select, { Option } from "metabase/core/components/Select";

describe("Select", () => {
  it("should render selected option", () => {
    render(
      <Select value="b">
        <Option value="a">option a</Option>
        <Option value="b">option b</Option>
      </Select>,
    );

    expect(screen.queryByText("option a")).not.toBeInTheDocument();
    expect(screen.getByText("option b")).toBeInTheDocument();
  });

  it("should render the defaultValue if none is selected", () => {
    render(
      <Select defaultValue="b">
        <Option value="a">option a</Option>
        <Option value="b">option b</Option>
      </Select>,
    );

    expect(screen.queryByText("option a")).not.toBeInTheDocument();
    expect(screen.getByText("option b")).toBeInTheDocument();
  });

  it("should render a placeholder if none is selected", () => {
    render(
      <Select placeholder="choose an option">
        <Option value="a">option a</Option>
        <Option value="b">option b</Option>
      </Select>,
    );

    expect(screen.queryByText("option a")).not.toBeInTheDocument();
    expect(screen.queryByText("option b")).not.toBeInTheDocument();
    expect(screen.getByText("choose an option")).toBeInTheDocument();
  });
});
