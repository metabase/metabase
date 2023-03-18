import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldSettings } from "metabase-types/api";
import { getDefaultFieldSettings } from "../../../utils";
import {
  FieldSettingsPopover,
  FieldSettingsPopoverProps,
} from "./FieldSettingsPopover";

function WrappedFieldSettingsPopover({
  fieldSettings: initialSettings,
  onChange,
}: FieldSettingsPopoverProps) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (nextSettings: FieldSettings) => {
    setSettings(nextSettings);
    onChange(nextSettings);
  };

  return (
    <FieldSettingsPopover fieldSettings={settings} onChange={handleChange} />
  );
}

function setup({ settings = getDefaultFieldSettings() } = {}) {
  const onChange = jest.fn();
  render(
    <WrappedFieldSettingsPopover
      fieldSettings={settings}
      onChange={onChange}
    />,
  );
  return { settings, onChange };
}

describe("actions > FormCreator > FieldSettingsPopover", () => {
  it("should allow to change the input type", async () => {
    const { settings, onChange } = setup();

    userEvent.click(screen.getByLabelText("Field settings"));
    userEvent.click(await screen.findByText("Dropdown"));

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      inputType: "select",
    });
  });

  it("should allow to change the placeholder", async () => {
    const { settings, onChange } = setup();

    userEvent.click(screen.getByLabelText("Field settings"));
    userEvent.type(await screen.findByLabelText("Placeholder text"), "$");

    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      placeholder: "$",
    });
  });

  it("should allow to make the field required and optional", async () => {
    const settings = getDefaultFieldSettings({
      fieldType: "number",
      required: true,
    });
    const { onChange } = setup({ settings });

    userEvent.click(screen.getByLabelText("Field settings"));
    userEvent.click(await screen.findByLabelText("Required"));
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      required: false,
    });
    expect(screen.queryByLabelText("Default value")).not.toBeInTheDocument();

    userEvent.click(screen.getByLabelText("Required"));
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      required: true,
    });
    expect(screen.getByLabelText("Default value")).toBeInTheDocument();
  });

  it("should allow to set the default value", async () => {
    const settings = getDefaultFieldSettings({
      fieldType: "number",
      required: true,
    });
    const { onChange } = setup({ settings });
    userEvent.click(screen.getByLabelText("Field settings"));

    const input = await screen.findByLabelText("Default value");
    userEvent.clear(input);
    userEvent.type(input, "10");

    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      defaultValue: 10,
    });
  });
});
