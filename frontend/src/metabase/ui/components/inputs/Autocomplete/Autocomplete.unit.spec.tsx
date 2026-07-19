import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import { Autocomplete, type AutocompleteProps } from "metabase/ui";

const DATA = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
];

const setup = (props: Partial<AutocompleteProps> = {}) => {
  const onChange = jest.fn();
  const onSearchChange = jest.fn();
  const onOptionSubmit = jest.fn();
  const allProps: AutocompleteProps = {
    label: "Fruit",
    data: DATA,
    onChange,
    onSearchChange,
    onOptionSubmit,
    ...props,
  };

  const { rerender } = render(<Autocomplete {...allProps} />);
  const input = screen.getByLabelText<HTMLInputElement>("Fruit");

  return {
    input,
    onChange,
    onSearchChange,
    onOptionSubmit,
    rerender: (next: Partial<AutocompleteProps>) =>
      rerender(<Autocomplete {...allProps} {...next} />),
  };
};

const isSelected = (name: string) =>
  screen.getByRole("option", { name }).getAttribute("data-combobox-selected");

describe("Autocomplete", () => {
  it("renders the label and the formatted value", () => {
    const { input } = setup({ value: "apple" });
    expect(input).toHaveValue("Apple");
  });

  it("reports search and resolved value while typing", async () => {
    const { input, onSearchChange, onChange } = setup();

    await userEvent.type(input, "Apple");

    expect(onSearchChange).toHaveBeenLastCalledWith("Apple");
    expect(onChange).toHaveBeenLastCalledWith("apple");
  });

  it("filters options by the input", async () => {
    const { input } = setup();

    await userEvent.type(input, "Ap");

    expect(
      await screen.findByRole("option", { name: "Apple" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apricot" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Banana" }),
    ).not.toBeInTheDocument();
  });

  it("submits an option on click", async () => {
    const { input, onOptionSubmit } = setup();

    await userEvent.click(input);
    await userEvent.click(
      await screen.findByRole("option", { name: "Apricot" }),
    );

    expect(onOptionSubmit).toHaveBeenCalledWith("apricot");
    expect(input).toHaveValue("Apricot");
  });

  it("is not editable when readOnly", async () => {
    const { input, onChange } = setup({ readOnly: true, value: "apple" });

    expect(input).toHaveAttribute("readonly");

    await userEvent.type(input, "berry");

    expect(input).toHaveValue("Apple");
    expect(onChange).not.toHaveBeenCalled();
  });

  describe("selectFirstOptionOnChange", () => {
    it("highlights the first option on first open with an empty input", async () => {
      const { input } = setup({ selectFirstOptionOnChange: true });

      await userEvent.click(input);

      await screen.findByRole("option", { name: "Apple" });
      await waitFor(() => expect(isSelected("Apple")).toBe("true"));
    });

    it("highlights the first matching option after typing", async () => {
      const { input } = setup({ selectFirstOptionOnChange: true });

      await userEvent.type(input, "Ap");

      await screen.findByRole("option", { name: "Apple" });
      await waitFor(() => expect(isSelected("Apple")).toBe("true"));
    });

    it("re-highlights the first option when new data loads while open", async () => {
      const { input, rerender } = setup({
        selectFirstOptionOnChange: true,
        data: [{ value: "banana", label: "Banana" }],
      });

      await userEvent.click(input);
      await screen.findByRole("option", { name: "Banana" });
      await waitFor(() => expect(isSelected("Banana")).toBe("true"));

      rerender({ data: DATA });

      await screen.findByRole("option", { name: "Apple" });
      await waitFor(() => expect(isSelected("Apple")).toBe("true"));
    });

    it("does not highlight any option by default", async () => {
      const { input } = setup();

      await userEvent.click(input);

      await screen.findByRole("option", { name: "Apple" });
      expect(isSelected("Apple")).toBeNull();
    });
  });
});
