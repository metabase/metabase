import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TableFieldOrder } from "metabase-types/api";

import { FieldOrderPicker } from "./FieldOrderPicker";

const OPTIONS: TableFieldOrder[] = [
  "smart",
  "database",
  "alphabetical",
  "custom",
];

const TOOLTIP_LABELS = [
  "Auto order",
  "Database order",
  "Alphabetical order",
  "Custom order",
];

interface SetupOpts {
  value?: TableFieldOrder;
}

function setup({ value = "smart" }: SetupOpts = {}) {
  const onChange = jest.fn();

  const { rerender } = renderWithProviders(
    <FieldOrderPicker value={value} onChange={onChange} />,
  );

  return { rerender, onChange };
}

describe("FieldOrderPicker", () => {
  it("renders all options with correct tooltips", async () => {
    setup();

    for (const label of TOOLTIP_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      await userEvent.hover(screen.getByLabelText(label));

      await waitFor(() => {
        expect(
          screen.getByRole("tooltip", { name: label }),
        ).toBeInTheDocument();
      });
    }
  });

  it.each(OPTIONS)("sets the correct option as selected - %s", (value) => {
    setup({ value });

    const index = OPTIONS.indexOf(value);
    const radio = screen.getByRole("radio", { name: TOOLTIP_LABELS[index] });
    expect(radio).toBeChecked();
  });

  it("calls onChange when a different option is selected", async () => {
    const { onChange } = setup({ value: "smart" });

    const radio = screen.getByRole("radio", { name: "Database order" });
    await userEvent.click(radio);

    expect(onChange).toHaveBeenCalledWith("database");
  });

  it("does not call onChange when the same option is selected", async () => {
    const { onChange } = setup({ value: "smart" });

    const radio = screen.getByRole("radio", { name: "Auto order" });
    await userEvent.click(radio);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("updates selected value when value prop changes", () => {
    const { rerender } = renderWithProviders(
      <FieldOrderPicker value="smart" onChange={jest.fn()} />,
    );

    expect(screen.getByRole("radio", { name: "Auto order" })).toBeChecked();
    rerender(<FieldOrderPicker value="custom" onChange={jest.fn()} />);
    expect(screen.getByRole("radio", { name: "Custom order" })).toBeChecked();
  });
});
