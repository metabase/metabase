import React from "react";
import { render, screen } from "@testing-library/react";

import Filter from "metabase-lib/lib/queries/structured/Filter";

import { InlineFilterSelect } from "./InlineFilterSelect";

describe("InlineFilterSelect", () => {
  it("renders a boolean picker for a boolean filter", () => {
    const testFilter = new Filter(["=", ["field", 999], true], null);
    const changeSpy = jest.fn();

    const { container } = render(
      <InlineFilterSelect
        fieldType="type/Boolean"
        filter={testFilter}
        handleChange={changeSpy}
      />,
    );

    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      2,
    );
    expect(screen.getByLabelText("true")).toBeChecked();
    expect(screen.getByLabelText("false")).not.toBeChecked();
  });

  it("renders a warning for an invalid field type", () => {
    const testFilter = new Filter(["=", ["field", 999], false], null);
    const changeSpy = jest.fn();

    const { container } = render(
      <InlineFilterSelect
        fieldType="type/Invalid"
        filter={testFilter}
        handleChange={changeSpy}
      />,
    );

    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      0,
    );
    expect(container.querySelectorAll(".Icon-warning")).toHaveLength(1);
  });
});
