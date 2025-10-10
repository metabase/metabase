import type { ComboboxItem, ComboboxItemGroup } from "@mantine/core";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { MultiAutocomplete, type MultiAutocompleteProps } from "./";

type TestInputProps = Omit<MultiAutocompleteProps, "value"> & {
  initialValue: string[];
};

function TestInput({ initialValue, onChange, ...props }: TestInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleChange = (newValue: string[]) => {
    onChange(newValue);
    setValue(newValue);
  };

  return <MultiAutocomplete {...props} value={value} onChange={handleChange} />;
}

const REMAPPED_DATA: ComboboxItem[] = [
  { value: "1", label: "One" },
  { value: "2", label: "Two" },
  { value: "3", label: "Three" },
  { value: "4", label: "Four" },
];

const GROUPED_DATA: ComboboxItemGroup[] = [
  { group: "A", items: ["A1", "A2"] },
  { group: "B", items: ["B1", "B2"] },
];

type SetupOpts = Omit<MultiAutocompleteProps, "value" | "onChange"> & {
  initialValue?: string[];
};

function setup({ initialValue = [], ...props }: SetupOpts = {}) {
  const onChange = jest.fn<void, [string[]]>();
  const onSearchChange = jest.fn<void, [string]>();

  renderWithProviders(
    <TestInput
      {...props}
      initialValue={initialValue}
      onChange={onChange}
      onSearchChange={onSearchChange}
    />,
  );

  const input = screen.getByRole("combobox");

  return { input, onChange, onSearchChange };
}

function getOption(name: string) {
  return screen.getByRole("option", { name });
}

function queryOption(name: string) {
  return screen.queryByRole("option", { name });
}

describe("MultiAutocomplete", () => {
  it("should accept values when blurring", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "foo");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith(["foo"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "bar");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should not accept values when blurring if they are not accepted by parseValue", async () => {
    const { input, onChange } = setup({
      parseValue: (value) => (value === "foo" ? value : null),
    });
    await userEvent.type(input, "foo");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");

    // this one does _not_ trigger a change
    await userEvent.type(input, "bar");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");
  });

  it("should accept values on enter", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "a{enter}bc{enter}def");
    expect(onChange).toHaveBeenCalledWith(["a", "bc", "def"]);
    expect(input).toHaveValue("def");

    await userEvent.click(document.body);
    expect(input).toHaveValue("");
  });

  it("should accept a value when no comma has been entered", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "foo");
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);

    await userEvent.type(input, ",bar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
  });

  it("should accept values when entering a comma", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "foo,");
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "bar,");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept quote-delimited values containing commas", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, '"foo bar",');
    expect(onChange).toHaveBeenLastCalledWith(["foo bar"]);
    expect(input).toHaveValue("");

    await userEvent.type(input, "baz,");
    expect(onChange).toHaveBeenLastCalledWith(["foo bar", "baz"]);
    expect(input).toHaveValue("");
  });

  it("should correctly parse escaped quotes", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, '"foo \\"bar\\"",');
    expect(onChange).toHaveBeenLastCalledWith(['foo "bar"']);
    expect(input).toHaveValue("");

    await userEvent.type(input, "baz,");
    expect(onChange).toHaveBeenLastCalledWith(['foo "bar"', "baz"]);
    expect(input).toHaveValue("");
  });

  it("should accept quote-delimited values containing commas when pasting", async () => {
    const { input, onChange } = setup();
    await userEvent.click(input);
    await userEvent.paste('"foo bar",baz');
    expect(onChange).toHaveBeenLastCalledWith(["foo bar", "baz"]);
    expect(input).toHaveValue("");
  });

  it("should correctly parse escaped quotes when pasting", async () => {
    const { input, onChange } = setup();
    await userEvent.click(input);
    await userEvent.paste('"foo \\"bar\\"",baz');
    expect(onChange).toHaveBeenLastCalledWith(['foo "bar"', "baz"]);
    expect(input).toHaveValue("");
  });

  it("should accept values with spaces in them", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "foo bar,");
    expect(onChange).toHaveBeenLastCalledWith(["foo bar"]);
    expect(input).toHaveValue("");
  });

  it("should not accept values when entering a comma if they are not accepted by parseValue", async () => {
    const { input, onChange } = setup({
      parseValue: (value) => (value === "foo" ? value : null),
    });
    await userEvent.type(input, "foo,");
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");

    // this one does _not_ trigger a change
    await userEvent.type(input, "bar,");
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    expect(input).toHaveValue("");
  });

  it("should accept comma-separated values when pasting", async () => {
    const { input, onChange } = setup();
    await userEvent.click(input);
    await userEvent.paste("foo,bar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept newline-separated values when pasting", async () => {
    const { input, onChange } = setup();
    await userEvent.click(input);
    await userEvent.paste("foo\nbar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept tab-separated values when pasting", async () => {
    const { input, onChange } = setup();
    await userEvent.click(input);
    await userEvent.paste("foo\tbar");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should accept comma-separated values, but omit values not accepted by parseValue", async () => {
    const { input, onChange } = setup({
      parseValue: (value) =>
        value === "foo" || value === "bar" ? value : null,
    });
    await userEvent.click(input);
    await userEvent.paste("foo,bar,baz");
    expect(onChange).toHaveBeenLastCalledWith(["foo", "bar"]);
    expect(input).toHaveValue("");
  });

  it("should handle pasting 1 value in the middle of the text in the input", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "123{arrowleft}");
    await userEvent.paste("45");
    expect(onChange).toHaveBeenLastCalledWith(["12453"]);
    expect(input).toHaveValue("12453");
  });

  it("should handle pasting 2 values in the middle of the text in the input", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "123{arrowleft}");
    await userEvent.paste("45,6");
    expect(onChange).toHaveBeenLastCalledWith(["1245", "63"]);
    expect(input).toHaveValue("");
  });

  it("should handle pasting 2 values at the start of the text in the input", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "123{arrowleft}{arrowleft}{arrowleft}");
    await userEvent.paste("45,6");
    expect(onChange).toHaveBeenLastCalledWith(["45", "6123"]);
    expect(input).toHaveValue("");
  });

  it("should handle pasting 2 values at the end of the text in the input", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "123");
    await userEvent.paste("45,6");
    expect(onChange).toHaveBeenLastCalledWith(["12345", "6"]);
    expect(input).toHaveValue("");
  });

  it("should handle pasting 3 values in the middle of the text in the input", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "123{arrowleft}");
    await userEvent.paste("45,6,78");
    expect(onChange).toHaveBeenLastCalledWith(["1245", "6", "783"]);
    expect(input).toHaveValue("");
  });

  it("should be possible to paste a partial value", async () => {
    const { input } = setup();
    await userEvent.click(input);
    await userEvent.paste('"quu');
    expect(input).toHaveValue('"quu');
  });

  it("should not be possible to enter duplicate values", async () => {
    const { input, onChange } = setup();
    await userEvent.click(input);
    await userEvent.type(input, "a,a,b,b,a,a,");
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(input).toHaveValue("");
  });

  it("should allow to edit a value", async () => {
    const { input, onChange } = setup({ initialValue: ["1", "2"] });
    await userEvent.click(screen.getByText("1"));
    expect(input).toHaveValue("1");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(["2"]);

    await userEvent.type(input, "3");
    expect(onChange).toHaveBeenLastCalledWith(["3", "2"]);

    await userEvent.type(input, ",4");
    expect(onChange).toHaveBeenLastCalledWith(["3", "4", "2"]);

    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(["3", "4", "2"]);
  });

  it("should display the remapped value with renderValue", () => {
    setup({
      initialValue: ["1", "2", "5"],
      data: REMAPPED_DATA,
      renderValue: ({ value }) =>
        REMAPPED_DATA.find((option) => option.value === value)?.label ?? value,
    });
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("should use the remapped value when editing", async () => {
    const { input, onChange } = setup({
      initialValue: ["1", "3"],
      data: REMAPPED_DATA,
      renderValue: ({ value }) =>
        REMAPPED_DATA.find((option) => option.value === value)?.label ?? value,
    });
    await userEvent.click(screen.getByText("One"));
    expect(input).toHaveValue("1");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "Two");
    expect(getOption("Two")).toBeInTheDocument();
    expect(queryOption("One")).not.toBeInTheDocument();

    await userEvent.click(getOption("Two"));
    expect(onChange).toHaveBeenLastCalledWith(["2", "3"]);
  });

  it("should quote the selected value when editing", async () => {
    const { input, onChange, onSearchChange } = setup({
      initialValue: ["a,b"],
    });
    await userEvent.click(screen.getByText("a,b"));
    expect(input).toHaveValue('"a,b"');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(input);
    await userEvent.type(input, "{selectall}{arrowright}{arrowleft}c");
    expect(input).toHaveValue('"a,bc"');
    expect(onChange).toHaveBeenCalledWith(["a,bc"]);
    expect(onSearchChange).toHaveBeenLastCalledWith("a,bc");
  });

  it("should escape the selected value when editing", async () => {
    const { input, onChange, onSearchChange } = setup({
      initialValue: ['a"b'],
    });
    await userEvent.click(screen.getByText('a"b'));
    expect(input).toHaveValue('"a\\"b"');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(input);
    await userEvent.type(input, "{selectall}{arrowright}{arrowleft}c");
    expect(input).toHaveValue('"a\\"bc"');
    expect(onChange).toHaveBeenCalledWith(['a"bc']);
    expect(onSearchChange).toHaveBeenLastCalledWith('a"bc');
  });

  it("should open and close the dropdown correctly", async () => {
    const { input, onChange } = setup({ data: REMAPPED_DATA });
    expect(queryOption("One")).not.toBeInTheDocument();

    await userEvent.click(input);
    expect(getOption("One")).toBeInTheDocument();
    expect(getOption("Two")).toBeInTheDocument();

    await userEvent.type(input, "on");
    expect(getOption("One")).toBeInTheDocument();
    expect(queryOption("Two")).not.toBeInTheDocument();
    expect(queryOption("Three")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("One"));
    expect(queryOption("One")).not.toBeInTheDocument();
    expect(queryOption("Two")).not.toBeInTheDocument();
    expect(queryOption("Three")).not.toBeInTheDocument();

    await userEvent.type(input, "{backspace}{backspace}t");
    expect(queryOption("One")).not.toBeInTheDocument();
    expect(getOption("Two")).toBeInTheDocument();
    expect(getOption("Three")).toBeInTheDocument();

    await userEvent.click(getOption("Two"));
    expect(queryOption("One")).not.toBeInTheDocument();
    expect(queryOption("Two")).not.toBeInTheDocument();
    expect(queryOption("Three")).toBeInTheDocument();

    await userEvent.type(input, "{backspace}");
    await userEvent.paste("three");
    expect(queryOption("One")).not.toBeInTheDocument();
    expect(queryOption("Two")).not.toBeInTheDocument();
    expect(getOption("Three")).toBeInTheDocument();

    await userEvent.click(getOption("Three"));
    expect(queryOption("One")).not.toBeInTheDocument();
    expect(queryOption("Two")).not.toBeInTheDocument();
    expect(queryOption("Three")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(["1", "2", "3"]);
  });

  it("should work with grouped options", async () => {
    const { input, onChange } = setup({ data: GROUPED_DATA });
    await userEvent.click(input);
    await userEvent.click(getOption("A1"));
    expect(onChange).toHaveBeenLastCalledWith(["A1"]);

    await userEvent.click(input);
    expect(queryOption("A1")).not.toBeInTheDocument();
    expect(getOption("A2")).toBeInTheDocument();
    expect(getOption("B1")).toBeInTheDocument();
    expect(getOption("B2")).toBeInTheDocument();

    await userEvent.type(input, "B");
    expect(queryOption("A1")).not.toBeInTheDocument();
    expect(queryOption("A2")).not.toBeInTheDocument();
    expect(getOption("B1")).toBeInTheDocument();
    expect(getOption("B2")).toBeInTheDocument();

    await userEvent.click(getOption("B2"));
    expect(onChange).toHaveBeenLastCalledWith(["A1", "B2"]);
  });

  it("should ignore duplicates when there are different string representations of the underlying value", async () => {
    const { input, onChange } = setup({
      parseValue: (value) => {
        const number = parseFloat(value);
        return Number.isNaN(number) ? null : String(number);
      },
    });
    await userEvent.type(input, "10,+10,20");
    expect(onChange).toHaveBeenLastCalledWith(["10", "20"]);
  });

  it("should ignore duplicates in the clipboard data", async () => {
    const { input, onChange } = setup({
      parseValue: (value) => {
        const number = parseFloat(value);
        return Number.isNaN(number) ? null : String(number);
      },
    });
    await userEvent.click(input);
    await userEvent.paste("10,+10,20");
    expect(onChange).toHaveBeenLastCalledWith(["10", "20"]);
  });

  it("should handle cases when 2 values are added at once", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "abcd{arrowleft}{arrowleft},");
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith(["ab", "cd"]);
  });

  it("should handle cases when a value is replaced with 2 values at once", async () => {
    const { input, onChange } = setup({ initialValue: ["abc"] });
    await userEvent.click(screen.getByText("abc"));
    await userEvent.type(input, "{arrowleft},");
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith(["ab", "c"]);
  });

  it("should close the dropdown on escape and open it back when typing", async () => {
    const { input } = setup({ data: REMAPPED_DATA });
    await userEvent.click(input);
    expect(getOption("One")).toBeInTheDocument();

    await userEvent.type(input, "{Escape}");
    expect(queryOption("One")).not.toBeInTheDocument();

    await userEvent.type(input, "on");
    expect(getOption("One")).toBeInTheDocument();
  });

  it("should not submit the input value during a keyboard composition session (metabase#60630)", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "foo");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toHaveValue("foo");
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);

    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith(["foo"]);
  });
});
