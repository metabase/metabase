import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getIcon } from "__support__/ui";

import TabRow from "../TabRow";
import TabButton, { RenameableTabButtonProps } from "./TabButton";

function setup(props?: Partial<RenameableTabButtonProps<string>>) {
  const action = jest.fn();
  const onRename = jest.fn();
  const value = "some_value";

  render(
    <TabRow>
      <TabButton.Renameable
        label="Tab 1"
        value={value}
        menuItems={[
          { label: "first item", action: (context, value) => action(value) },
        ]}
        {...props}
        onRename={onRename}
      />
    </TabRow>,
  );
  return { action, onRename, value };
}

describe("TabButton", () => {
  it("should open the menu upon clicking the chevron", async () => {
    setup();

    userEvent.click(getIcon("chevrondown"));

    expect(
      await screen.findByRole("option", { name: "first item" }),
    ).toBeInTheDocument();
  });

  it("should call the action function upon clicking an item in the menu", async () => {
    const { action, value } = setup();

    userEvent.click(getIcon("chevrondown"));
    (await screen.findByRole("option", { name: "first item" })).click();

    expect(action).toHaveBeenCalledWith(value);
  });

  it("should not open the menu when disabled", async () => {
    setup({ disabled: true });

    userEvent.click(getIcon("chevrondown"));

    expect(
      screen.queryByRole("option", { name: "first item" }),
    ).not.toBeInTheDocument();
  });

  it("should call the onRename function when renaming and update its own label", async () => {
    const { onRename } = setup();

    userEvent.click(getIcon("chevrondown"));
    (await screen.findByRole("option", { name: "Rename" })).click();

    const newLabel = "A new label";
    const inputEl = screen.getByRole("textbox");
    userEvent.type(inputEl, newLabel);
    fireEvent.keyPress(inputEl, { key: "Enter", charCode: 13 });

    expect(onRename).toHaveBeenCalledWith(newLabel);
    expect(await screen.findByDisplayValue(newLabel)).toBeInTheDocument();
  });
});
