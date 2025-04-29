import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { NameDescriptionInput } from "./NameDescriptionInput";

interface SetupOpts {
  description: string;
  name: string;
}

function setup({ description = "", name = "" }: Partial<SetupOpts> = {}) {
  const onDescriptionChange = jest.fn();
  const onNameChange = jest.fn();

  render(
    <NameDescriptionInput
      description={description}
      descriptionPlaceholder="Enter description"
      name={name}
      namePlaceholder="Enter name"
      onDescriptionChange={onDescriptionChange}
      onNameChange={onNameChange}
    />,
  );

  return {
    onDescriptionChange,
    onNameChange,
  };
}

describe("NameDescriptionInput", () => {
  it('should trigger "onDescriptionChange" on description input blur', async () => {
    const { onDescriptionChange } = setup();

    const descriptionInput = screen.getByPlaceholderText("Enter description");
    descriptionInput.focus();
    descriptionInput.blur();

    // should not be triggered if value hasn't changed
    expect(onDescriptionChange).toHaveBeenCalledTimes(0);

    await userEvent.type(descriptionInput, "test");
    descriptionInput.blur();

    expect(onDescriptionChange).toHaveBeenCalledTimes(1);
    expect(onDescriptionChange.mock.calls).toEqual([["test"]]);
  });

  it('should trigger "onNameChange" on name input blur', async () => {
    const { onNameChange } = setup();

    const nameInput = screen.getByPlaceholderText("Enter name");
    nameInput.focus();
    nameInput.blur();

    // should not be triggered if value hasn't changed
    expect(onNameChange).toHaveBeenCalledTimes(0);

    await userEvent.type(nameInput, "test");
    nameInput.blur();

    expect(onNameChange).toHaveBeenCalledTimes(1);
    expect(onNameChange.mock.calls).toEqual([["test"]]);
  });
});
