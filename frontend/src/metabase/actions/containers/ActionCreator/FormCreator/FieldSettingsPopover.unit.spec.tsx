import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getDefaultFieldSettings } from "../../../utils";
import { FieldSettingsPopover } from "./FieldSettingsPopover";

function setup({ settings = getDefaultFieldSettings() } = {}) {
  const onChange = jest.fn();
  render(<FieldSettingsPopover fieldSettings={settings} onChange={onChange} />);
  return { settings, onChange };
}

describe("actions > FormCreator > FieldSettingsPopover", () => {
  it("should show the popover", async () => {
    setup();

    userEvent.click(screen.getByLabelText("Field settings"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();
  });

  it("should fire onChange handler clicking a different field type", async () => {
    const { settings, onChange } = setup();

    userEvent.click(screen.getByLabelText("Field settings"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();

    userEvent.click(screen.getByText("Date"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      fieldType: "date",
      inputType: "date", // should set default input type for new field type
    });
  });

  it("should fire onChange handler clicking a different input type", async () => {
    const { settings, onChange } = setup();

    userEvent.click(screen.getByLabelText("Field settings"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();

    userEvent.click(screen.getByText("Dropdown"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      inputType: "select",
    });
  });

  it("should fire onChange handler editing placeholder", async () => {
    const { settings, onChange } = setup();

    userEvent.click(screen.getByLabelText("Field settings"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("placeholder-input"), "$");

    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      placeholder: "$",
    });
  });
});
