import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, fireEvent, render, screen } from "__support__/ui";
import { MultiAutocomplete, type MultiAutocompleteProps } from "metabase/ui";

const EXAMPLE_DATA = [
  { label: "Foo", value: "foo" },
  { label: "Bar", value: "bar" },
  { label: "Bar (2)", value: "bar-2" },
];

const NUMERIC_DATA = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
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
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "bar", {
      pointerEventsCheck: 0,
    });
    fireEvent.blur(input);

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
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");

    // this one does _not_ trigger a change
    await userEvent.type(input, "bar", {
      pointerEventsCheck: 0,
    });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");
  });

  it("should accept a value when no comma has been entered", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, "foo", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);

    await userEvent.type(input, ",bar", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
  });

  it("should accept values when entering a comma", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, "foo,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "bar,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept quote-delimited values containing commas", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, '"foo bar",', {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo bar"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "baz,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo bar", "baz"]);
    expect(input).toHaveValue("");
  });

  it("should correctly parse escaped quotes", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, '"foo \\"bar\\"",', {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(['foo "bar"']);
    expect(input).toHaveValue("");

    await userEvent.type(input, "baz,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(['foo "bar"', "baz"]);
    expect(input).toHaveValue("");
  });

  it("should accept quote-delimited values containing commas when pasting", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    act(() => input.focus());
    await userEvent.paste('"foo bar",baz');
    expect(onChange).toHaveBeenLastCalledWith(["foo bar", "baz"]);
    expect(input).toHaveValue("");
  });

  it("should correctly parse escaped quotes when pasting", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    act(() => input.focus());
    await userEvent.paste('"foo \\"bar\\"",baz');
    expect(onChange).toHaveBeenLastCalledWith(['foo "bar"', "baz"]);
    expect(input).toHaveValue("");
  });

  it("should accept values with spaces in them", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    await userEvent.type(input, "foo bar,", {
      pointerEventsCheck: 0,
    });
    expect(onChange).toHaveBeenLastCalledWith(["foo bar"]);
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
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
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
    act(() => input.focus());
    await userEvent.paste("foo,bar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept newline-separated values when pasting", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    act(() => input.focus());
    await userEvent.paste("foo\nbar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept tab-separated values when pasting", async () => {
    const { input, onChange } = setup({ data: EXAMPLE_DATA });
    act(() => input.focus());
    await userEvent.paste("foo\tbar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept comma-separated values, but omit values not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
      shouldCreate(value: string) {
        return value === "foo" || value === "bar";
      },
    });
    act(() => input.focus());
    await userEvent.paste("foo,bar,baz");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should handle pasting when there is some text in the input", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
    });
    await userEvent.type(input, "foo123", {
      pointerEventsCheck: 0,
    });

    act(() => input.focus());
    // @ts-expect-error: input does have setSelectionRange, and testing-library does not provide a wrapper
    input.setSelectionRange(3, 3);
    await userEvent.paste("quu,xyz");

    expect(onChange).toHaveBeenLastCalledWith(["fooquu", "xyz123"]);
    expect(input).toHaveValue("");
  });

  it("should be possible to paste a partial value", async () => {
    const { input } = setup({
      data: EXAMPLE_DATA,
    });

    act(() => input.focus());
    await userEvent.paste('"quu');

    expect(input).toHaveValue('"quu');
  });

  it("should not be possible to enter duplicate values", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
    });

    act(() => input.focus());
    await userEvent.type(input, "a,a,b,b,a,a,", {
      pointerEventsCheck: 0,
    });

    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(input).toHaveValue("");
  });

  it("should respect RTL languages when pasting", async () => {
    const { input, onChange } = setup({
      data: EXAMPLE_DATA,
      dir: "rtl",
    });

    act(() => input.focus());
    await userEvent.type(input, "כּטקמ", {
      pointerEventsCheck: 0,
    });
    expect(input).toHaveValue("כּטקמ");

    // @ts-expect-error: input does have setSelectionRange, and testing-library does not provide a wrapper
    input.setSelectionRange(3, 3);
    await userEvent.paste("ץ,ף");

    expect(onChange).toHaveBeenLastCalledWith(["כּטץ", "ףקמ"]);
    expect(input).toHaveValue("");
  });

  describe("numberic values", () => {
    it("should work with number values", async () => {
      const { input, onChange } = setup({
        data: NUMERIC_DATA,
        parseValue: str => parseFloat(str),
      });

      input.focus();
      await userEvent.type(input, "55", {
        pointerEventsCheck: 0,
      });
      expect(input).toHaveValue("55");
      input.blur();

      expect(onChange).toHaveBeenLastCalledWith([55]);
      expect(input).toHaveValue("");

      await userEvent.type(input, "42,12.34", {
        pointerEventsCheck: 0,
      });
      input.blur();

      expect(onChange).toHaveBeenLastCalledWith([55, 42, 12.34]);
      expect(input).toHaveValue("");
    });

    it("should accept comma-separated values when pasting", async () => {
      const { input, onChange } = setup({
        data: NUMERIC_DATA,
        parseValue: str => parseFloat(str),
      });

      input.focus();
      await userEvent.paste("33.333,42");
      expect(onChange).toHaveBeenLastCalledWith([33.333, 42]);
      expect(input).toHaveValue("");
    });

    it("should not be possible to enter duplicate values", async () => {
      const { input, onChange } = setup({
        data: NUMERIC_DATA,
        parseValue: str => parseFloat(str),
      });

      input.focus();
      await userEvent.type(input, "1,1,2,2,1,1,", {
        pointerEventsCheck: 0,
      });

      expect(onChange).toHaveBeenLastCalledWith([1, 2]);
      expect(input).toHaveValue("");
    });

    it("should not accept NaN values", async () => {
      const { input, onChange } = setup({
        data: EXAMPLE_DATA,
        parseValue: str => parseFloat(str),
      });
      input.focus();
      await userEvent.paste("10,11,12,not-a-number");
      expect(onChange).toHaveBeenLastCalledWith([10, 11, 12]);
      expect(input).toHaveValue("");
    });

    it("should accept comma-separated values, but omit values not accepted by shouldCreate", async () => {
      const { input, onChange } = setup({
        data: EXAMPLE_DATA,
        parseValue: str => parseFloat(str),
        shouldCreate(value: number | string) {
          if (typeof value !== "number") {
            return false;
          }
          return value % 2 === 0;
        },
      });
      input.focus();
      await userEvent.paste("10,11,12,not-a-number");
      expect(onChange).toHaveBeenLastCalledWith([10, 12]);
      expect(input).toHaveValue("");
    });
  });
});
