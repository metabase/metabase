import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders, screen } from "__support__/ui";

import { TabRow } from "../TabRow";

import type { RenameableTabButtonProps } from "./TabButton";
import { INPUT_WRAPPER_TEST_ID, TabButton } from "./TabButton";

function setup(props?: Partial<RenameableTabButtonProps>) {
  const action = jest.fn();
  const onRename = jest.fn();
  const value = "some_value";

  renderWithProviders(
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

    await userEvent.click(getIcon("chevrondown"));

    expect(
      await screen.findByRole("option", { name: "first item" }),
    ).toBeInTheDocument();
  });

  it("should call the action function upon clicking an item in the menu", async () => {
    const { action, value } = setup();

    await userEvent.click(getIcon("chevrondown"));
    await userEvent.click(
      await screen.findByRole("option", { name: "first item" }),
    );

    expect(action).toHaveBeenCalledWith(value);
  });

  it("should not open the menu when disabled", async () => {
    setup({ disabled: true });

    await userEvent.click(getIcon("chevrondown"));

    expect(
      screen.queryByRole("option", { name: "first item" }),
    ).not.toBeInTheDocument();
  });

  it("should call the onRename function when renaming and update its own label", async () => {
    const { onRename } = setup();

    await userEvent.click(getIcon("chevrondown"));
    await userEvent.click(await renameOption());

    const newLabel = "A new label";
    const inputEl = await screen.findByRole("textbox");
    await userEvent.clear(inputEl);
    await userEvent.type(inputEl, `${newLabel}{enter}`);

    expect(onRename).toHaveBeenCalledWith(newLabel);
    expect(await screen.findByDisplayValue(newLabel)).toBeInTheDocument();
  });

  it("should ignore an empty tab name and revert to the previous on blur", async () => {
    const { onRename } = setup();

    await userEvent.click(getIcon("chevrondown"));
    await userEvent.click(await renameOption());

    const oldLabel = "Tab 1";
    const inputEl = await screen.findByRole("textbox");

    // Clear the input and press Enter
    await userEvent.clear(inputEl);
    await userEvent.type(inputEl, `{enter}`);
    expect(onRename).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue(oldLabel)).toBeInTheDocument();

    // Let's do that one more time but with a name that contains only spaces
    await userEvent.click(getIcon("chevrondown"));
    await userEvent.click(await renameOption());
    await userEvent.clear(inputEl);
    await userEvent.type(inputEl, `  {enter}`);
    expect(onRename).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue(oldLabel)).toBeInTheDocument();
  });

  it("should allow the user to rename via double click", async () => {
    const { onRename } = setup();

    await userEvent.dblClick(screen.getByTestId(INPUT_WRAPPER_TEST_ID));

    const newLabel = "A new label";
    const inputEl = screen.getByRole("textbox");
    await userEvent.clear(inputEl);
    await userEvent.type(inputEl, `${newLabel}{enter}`);

    expect(onRename).toHaveBeenCalledWith(newLabel);
    expect(await screen.findByDisplayValue(newLabel)).toBeInTheDocument();
  });

  it("should limit the length to 75 chars", async () => {
    const { onRename } = setup();

    await userEvent.click(getIcon("chevrondown"));
    await userEvent.click(await renameOption());

    const newLabel = "a".repeat(100);
    const expectedLabel = newLabel.slice(0, 75);

    const inputEl = await screen.findByRole("textbox");
    await userEvent.clear(inputEl);
    await userEvent.paste(newLabel);
    await userEvent.type(inputEl, `{enter}`, { delay: 0 });

    expect(onRename).toHaveBeenCalledWith(expectedLabel);
    expect(await screen.findByDisplayValue(expectedLabel)).toBeInTheDocument();
  });
});

const renameOption = () => screen.findByRole("option", { name: "Rename" });
