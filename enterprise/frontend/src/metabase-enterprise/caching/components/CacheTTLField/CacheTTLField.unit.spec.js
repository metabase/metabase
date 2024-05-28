import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CacheTTLField from "./CacheTTLField";

function setup({ name = "cache_ttl", message, value }) {
  const onChange = jest.fn();
  render(
    <form>
      <span id={`${name}-label`}>Label</span>
      <CacheTTLField
        field={{ name, value, onChange }}
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
  ].forEach(({ value, expected }) => {
    it(`displays ${value} value as ${expected}`, () => {
      const { field } = setup({ value });
      expect(field).toHaveValue(expected);
    });
  });

  it("displays a placeholder for null values", () => {
    const { field } = setup({ value: null });

    expect(field).toHaveAttribute("placeholder", "24");
    expect(field).toHaveValue("");
  });

  it("displays message", () => {
    setup({ message: "Cache results for" });
    expect(screen.getByText("Cache results for")).toBeInTheDocument();
  });

  it("calls onChange correctly", async () => {
    const { field, onChange } = setup({ value: 4 });

    await userEvent.clear(field);
    await userEvent.type(field, "14");
    field.blur();

    expect(onChange).toHaveBeenLastCalledWith(14);
  });

  it("calls onChange with null value if input is cleared", async () => {
    const { field, onChange } = setup({ value: 4 });

    await userEvent.clear(field);
    field.blur();

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
