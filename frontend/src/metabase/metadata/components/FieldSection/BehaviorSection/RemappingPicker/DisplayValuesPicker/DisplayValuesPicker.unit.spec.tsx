import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { DisplayValuesPicker } from "./DisplayValuesPicker";
import type { RemappingValue } from "./types";

const setup = ({
  options = ["original", "foreign", "custom"],
  value = "original",
  onChange = jest.fn(),
}: {
  options?: RemappingValue[];
  value?: RemappingValue;
  onChange?: (value: RemappingValue) => void;
} = {}) => {
  const { rerender } = renderWithProviders(
    <DisplayValuesPicker
      options={options}
      placeholder="Pick a value"
      value={value}
      onChange={onChange}
    />,
  );

  return {
    rerender,
    props: {
      options,
      value,
      onChange,
    },
  };
};

describe("DisplayValuesPicker", () => {
  it("renders select with all options", async () => {
    setup();

    await userEvent.click(screen.getByPlaceholderText("Pick a value"));

    const dropdown = within(screen.getByRole("listbox"));
    expect(
      dropdown.getByRole("option", { name: /Use original value/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
    expect(
      dropdown.getByRole("option", { name: /Use foreign key/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
    expect(
      dropdown.getByRole("option", { name: /Custom mapping/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
  });

  it("disables options that are not in the options prop", async () => {
    setup({ options: ["original", "custom"] });

    await userEvent.click(screen.getByPlaceholderText("Pick a value"));

    const dropdown = within(screen.getByRole("listbox"));
    expect(
      dropdown.getByRole("option", { name: /Use original value/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
    expect(
      dropdown.getByRole("option", { name: /Use foreign key/ }),
    ).toHaveAttribute("data-combobox-disabled", "true");
    expect(
      dropdown.getByRole("option", { name: /Custom mapping/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
  });

  it("shows current value as selected", () => {
    setup({ value: "custom" });

    expect(screen.getByText("Custom mapping")).toBeInTheDocument();
  });

  it("calls onChange when selecting a new value", async () => {
    const onChange = jest.fn();
    setup({ onChange });

    await userEvent.click(screen.getByPlaceholderText("Pick a value"));

    const dropdown = within(screen.getByRole("listbox"));
    const option = dropdown.getByText("Use foreign key");
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith("foreign");
  });

  it("updates when value prop changes", async () => {
    const { rerender, props } = setup({ value: "original" });

    await userEvent.click(screen.getByPlaceholderText("Pick a value"));
    const dropdown = within(screen.getByRole("listbox"));
    expect(dropdown.getByText("Use original value")).toBeInTheDocument();

    rerender(<DisplayValuesPicker {...props} value="foreign" />);

    expect(dropdown.getByText("Use foreign key")).toBeInTheDocument();
  });

  it("preserves current value in options even if not in options prop", async () => {
    setup({
      options: ["original"],
      value: "custom",
    });

    expect(screen.getByText("Custom mapping")).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText("Pick a value"));

    const dropdown = within(screen.getByRole("listbox"));
    expect(
      dropdown.getByRole("option", { name: /Use original value/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
    expect(
      dropdown.getByRole("option", { name: /Use foreign key/ }),
    ).toHaveAttribute("data-combobox-disabled", "true");
    expect(
      dropdown.getByRole("option", { name: /Custom mapping/ }),
    ).not.toHaveAttribute("data-combobox-disabled");
  });
});
