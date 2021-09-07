import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CacheTTLField } from "./CacheTTLField";

function setup({ name = "cache_ttl", message, value, initialValue }) {
  const onChange = jest.fn();
  render(
    <form>
      <span id={`${name}-label`}>Label</span>
      <CacheTTLField
        field={{ name, value, initialValue, onChange }}
        message={message}
        onChange={onChange}
      />
    </form>,
  );
  const field = screen.getByLabelText("Label");
  return { field, onChange };
}

describe("CacheTTLField", () => {
  [
    { value: 0, expected: "0" },
    { value: 1, expected: "1" },
    { value: 12, expected: "12" },
    { value: null, expected: "0" },
  ].forEach(({ value, expected }) => {
    it(`displays ${value} value as ${expected}`, () => {
      const { field } = setup({ value });
      expect(field).toHaveValue(expected);
    });
  });

  it("overwrites value with initialValue if value is null", () => {
    const { field } = setup({ value: null, initialValue: 4 });
    expect(field).toHaveValue("4");
  });

  it("uses value instead of initialValue if value is not null", () => {
    const { field } = setup({ value: 8, initialValue: 4 });
    expect(field).toHaveValue("8");
  });

  it("displays message", () => {
    setup({ message: "Cache results for" });
    expect(screen.queryByText("Cache results for")).toBeInTheDocument();
  });

  it("calls onChange correctly", () => {
    const { field, onChange } = setup({ value: 4 });

    userEvent.clear(field);
    userEvent.type(field, "14");
    field.blur();

    expect(onChange).toHaveBeenLastCalledWith(14);
  });

  it("calls onChange with null value if input is cleared", () => {
    const { field, onChange } = setup({ value: 4 });

    userEvent.clear(field);
    field.blur();

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
