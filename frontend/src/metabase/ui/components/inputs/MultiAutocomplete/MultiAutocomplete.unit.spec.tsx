import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen } from "__support__/ui";
import { MultiAutocomplete, type MultiAutocompleteProps } from "metabase/ui";

const EXAMPLE_DATA = [
  { label: "Foo", value: "foo" },
  { label: "Bar", value: "bar" },
  { label: "Bar (2)", value: "bar-2" },
];

type SetupOpts = Omit<TestInputProps, "onChange">;

function setup(opts: SetupOpts) {
  const onChange = jest.fn();
  render(<TestInput {...opts} onChange={onChange} aria-label="Filter value" />);

  const input = screen.getByRole("searchbox");
  return { onChange, input };
}

type TestInputProps = MultiAutocompleteProps & {
  initialValue?: string[];
};

function TestInput(props: TestInputProps) {
  const [value, setValue] = useState(props.initialValue ?? []);

  function handleChange(value: string[]) {
    setValue(value);
    props.onChange?.(value);
  }

  return <MultiAutocomplete {...props} value={value} onChange={handleChange} />;
}

describe("MultiAutocomplete", () => {
  it("should accept values when blurring", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, "foo", {
      pointerEventsCheck: 0,
    });
    input.blur();

    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "bar", {
      pointerEventsCheck: 0,
    });
    input.blur();

    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should not accept values when blurring if they are not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
      shouldCreate(value: string) {
        return value === "foo";
      },
    });
    await userEvent.type(input, "foo", {
      pointerEventsCheck: 0,
    });
    input.blur();

    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");

    // this one does _not_ trigger a change
    await userEvent.type(input, "bar", {
      pointerEventsCheck: 0,
    });
    input.blur();

    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");
  });

  it("should accept values when entering a comma", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, "foo,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "bar,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept values with spaces in them", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, "foo bar,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenCalledWith(["foo bar"]);
    expect(input).toHaveValue("");
  });

  it("should not accept values when entering a comma if they are not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
      shouldCreate(value: string) {
        return value === "foo";
      },
    });
    await userEvent.type(input, "foo,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");

    // this one does _not_ trigger a change
    await userEvent.type(input, "bar,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");
  });

  it("should accept comma-separated values when pasting", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    input.focus();
    await userEvent.paste("foo,bar");
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept newline-separated values when pasting", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    input.focus();
    await userEvent.paste("foo\nbar");
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept comma-separated values, but omit values not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
      shouldCreate(value: string) {
        return value === "foo" || value === "bar";
      },
    });
    input.focus();
    await userEvent.paste("foo,bar,baz");
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });
});
