import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getDefaultFieldSettings } from "../../../utils";
import { FieldSettingsPopover } from "./FieldSettingsPopover";

describe("actions > FormCreator > FieldSettingsPopover", () => {
  it("should show the popover", async () => {
    const changeSpy = jest.fn();
    const settings = getDefaultFieldSettings();

    render(
      <FieldSettingsPopover fieldSettings={settings} onChange={changeSpy} />,
    );

    await userEvent.click(screen.getByLabelText("gear icon"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();
  });

  it("should fire onChange handler clicking a different field type", async () => {
    const changeSpy = jest.fn();
    const settings = getDefaultFieldSettings();

    render(
      <FieldSettingsPopover fieldSettings={settings} onChange={changeSpy} />,
    );

    await userEvent.click(screen.getByLabelText("gear icon"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("date"));

    expect(changeSpy).toHaveBeenCalledTimes(1);

    expect(changeSpy).toHaveBeenCalledWith({
      ...settings,
      fieldType: "date",
      inputType: "date", // should set default input type for new field type
    });
  });

  it("should fire onChange handler clicking a different input type", async () => {
    const changeSpy = jest.fn();
    const settings = getDefaultFieldSettings();

    render(
      <FieldSettingsPopover fieldSettings={settings} onChange={changeSpy} />,
    );

    await userEvent.click(screen.getByLabelText("gear icon"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("dropdown"));

    expect(changeSpy).toHaveBeenCalledTimes(1);

    expect(changeSpy).toHaveBeenCalledWith({
      ...settings,
      inputType: "select",
    });
  });

  it("should fire onChange handler editing placeholder", async () => {
    const changeSpy = jest.fn();
    const settings = getDefaultFieldSettings();

    render(
      <FieldSettingsPopover fieldSettings={settings} onChange={changeSpy} />,
    );

    await userEvent.click(screen.getByLabelText("gear icon"));

    expect(
      await screen.findByTestId("field-settings-popover"),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("placeholder-input"), "$");

    expect(changeSpy).toHaveBeenLastCalledWith({
      ...settings,
      placeholder: "$",
    });
  });
});
