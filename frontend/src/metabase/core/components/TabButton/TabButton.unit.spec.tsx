import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getIcon } from "__support__/ui";

import TabRow from "../TabRow";
import TabButton, { TabButtonProps } from "./TabButton";

function setup(props?: TabButtonProps) {
  const action = jest.fn();
  const value = "some_value";

  render(
    <TabRow>
      <TabButton
        value={value}
        menuItems={[
          { label: "first item", action: (context, value) => action(value) },
        ]}
        {...props}
      >
        Tab 1
      </TabButton>
    </TabRow>,
  );
  return { action, value };
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
});
