import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import type { FieldSettings } from "metabase-types/api";

import { getDefaultFieldSettings } from "../../../utils";

import type { FieldSettingsPopoverProps } from "./FieldSettingsPopover";
import { FieldSettingsPopover } from "./FieldSettingsPopover";

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

    await userEvent.click(screen.getByLabelText("Field settings"));
    await userEvent.click(await screen.findByText("Dropdown"));

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      inputType: "select",
    });
  });

  it("should allow to change the placeholder", async () => {
    const { settings, onChange } = setup();

    await userEvent.click(screen.getByLabelText("Field settings"));
    await userEvent.type(await screen.findByLabelText("Placeholder text"), "$");

    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      placeholder: "$",
    });
  });

  describe("when field has placeholder", () => {
    it("should render two <Divider />s", async () => {
      const settings = getDefaultFieldSettings({
        fieldType: "string",
      });
      setup({ settings });

      await userEvent.click(screen.getByLabelText("Field settings"));
      await screen.findByLabelText("Default value");

      expect(screen.getAllByTestId("divider").length).toBe(2);
    });
  });

  describe("when field does not have placeholder", () => {
    it("should render one <Divider />", async () => {
      const settings = getDefaultFieldSettings({
        fieldType: "date",
      });
      setup({ settings });

      await userEvent.click(screen.getByLabelText("Field settings"));
      await screen.findByLabelText("Default value");

      expect(screen.getAllByTestId("divider").length).toBe(1);
    });
  });

  it("should allow to make the field required and optional", async () => {
    const settings = getDefaultFieldSettings({
      fieldType: "number",
      required: true,
    });
    const { onChange } = setup({ settings });

    await userEvent.click(screen.getByLabelText("Field settings"));
    await userEvent.click(await screen.findByLabelText("Required"));
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      required: false,
    });
    expect(screen.queryByLabelText("Default value")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Required"));
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
    await userEvent.click(screen.getByLabelText("Field settings"));

    const input = await screen.findByLabelText("Default value");
    await userEvent.clear(input);
    await userEvent.type(input, "10");

    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      defaultValue: 10,
    });
  });
});
