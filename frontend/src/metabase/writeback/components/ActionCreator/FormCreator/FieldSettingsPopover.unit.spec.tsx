import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FieldSettingsPopover } from "./FieldSettingsPopover";
import { getDefaultFieldSettings } from "./utils";

describe("writeback > FormCreator > FieldSettingsPopover", () => {
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
      inputType: "dropdown",
    });
  });
});
