import type { ComboboxItem } from "@mantine/core";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { MultiAutocomplete, type MultiAutocompleteProps } from "./";

type TestInputProps = Omit<MultiAutocompleteProps, "values"> & {
  initialValues: string[];
};

function TestInput({ initialValues, onChange, ...props }: TestInputProps) {
  const [values, setValues] = useState(initialValues);

  const handleChange = (newValues: string[]) => {
    onChange(newValues);
    setValues(newValues);
  };

  return (
    <MultiAutocomplete {...props} values={values} onChange={handleChange} />
  );
}

const REMAPPED_OPTIONS: ComboboxItem[] = [
  { value: "1", label: "One" },
  { value: "2", label: "Two" },
  { value: "3", label: "Three" },
  { value: "4", label: "Four" },
];

type SetupOpts = {
  initialValues?: string[];
  options?: ComboboxItem[];
  placeholder?: string;
  shouldCreate?: (value: string) => boolean;
  autoFocus?: boolean;
  rightSection?: ReactNode;
  nothingFoundMessage?: ReactNode;
  "aria-label"?: string;
};

function setup({
  initialValues = [],
  options = [],
  placeholder = "Enter some text",
  shouldCreate,
}: SetupOpts = {}) {
  const onChange = jest.fn<void, [string[]]>();
  const onSearchChange = jest.fn<void, [string]>();

  renderWithProviders(
    <TestInput
      initialValues={initialValues}
      options={options}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      onChange={onChange}
      onSearchChange={onSearchChange}
    />,
  );

  const input = screen.getByRole("combobox");

  return { input, onChange, onSearchChange };
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

  it("should not accept values when blurring if they are not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      shouldCreate: (value) => value === "foo",
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

  it("should not accept values when entering a comma if they are not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      shouldCreate: (value) => value === "foo",
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

  it("should accept comma-separated values, but omit values not accepted by shouldCreate", async () => {
    const { input, onChange } = setup({
      shouldCreate: (value) => value === "foo" || value === "bar",
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
    const { input, onChange } = setup({ initialValues: ["1", "2"] });
    await userEvent.click(screen.getByText("1"));
    expect(input).toHaveValue("1");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(["2"]);

    await userEvent.type(input, "3");
    expect(onChange).toHaveBeenLastCalledWith(["3", "2"]);

    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("should display the remapped value when there are matching options", () => {
    setup({ initialValues: ["1", "2", "5"], options: REMAPPED_OPTIONS });
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("should use the remapped value when editing", async () => {
    const { input, onChange } = setup({
      initialValues: ["1", "3"],
      options: REMAPPED_OPTIONS,
    });
    await userEvent.click(screen.getByText("One"));
    expect(input).toHaveValue("One");
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.queryByText("Two")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "Two");
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.queryByText("One")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Two"));
    expect(onChange).toHaveBeenLastCalledWith(["2", "3"]);
  });
});
