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

const OPTIONS: ComboboxItem[] = [
  { value: "1", label: "One" },
  { value: "2", label: "Two" },
  { value: "3", label: "Three" },
  { value: "4", label: "Four" },
];
const PLACEHOLDER = "Enter some text";

function setup({
  initialValues = [],
  options = [],
  placeholder = PLACEHOLDER,
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

  return { onChange, onSearchChange };
}

function getInput() {
  return screen.getByRole("combobox");
}

function getOptionList() {
  return screen.getByRole("list");
}

describe("MultiAutocomplete", () => {
  it("should allow to enter multiple values", async () => {
    const { onChange } = setup();
    await userEvent.type(getInput(), "a,ab,abc");
    expect(onChange).toHaveBeenLastCalledWith(["a", "ab", "abc"]);
  });

  it("should open the dropdown when started editing a value", async () => {
    setup({ initialValues: ["1"], options: OPTIONS });
    await userEvent.click(screen.getByText("One"));
    expect(getInput()).toHaveValue("One");
    expect(getOptionList()).toBeInTheDocument();
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.queryByText("Two")).not.toBeInTheDocument();
  });
});
