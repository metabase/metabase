import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { NameDescriptionInput } from "./NameDescriptionInput";

interface SetupOpts {
  description: string;
  name: string;
  namePrefix?: string;
}

function setup({
  description = "",
  name = "",
  namePrefix,
}: Partial<SetupOpts> = {}) {
  const onDescriptionChange = jest.fn();
  const onNameChange = jest.fn();

  render(
    <NameDescriptionInput
      description={description}
      descriptionPlaceholder="Enter description"
      name={name}
      nameIcon="table2"
      namePlaceholder="Enter name"
      namePrefix={namePrefix}
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
  it("should not allow empty names", async () => {
    const { onNameChange } = setup({ name: "xyz" });

    const nameInput = screen.getByPlaceholderText("Enter name");
    await userEvent.type(nameInput, "{backspace}".repeat(3));
    nameInput.blur();

    expect(onNameChange).toHaveBeenCalledTimes(0);
  });

  it("should allow empty description", async () => {
    const { onDescriptionChange } = setup({ description: "xyz" });

    const descriptionInput = screen.getByPlaceholderText("Enter description");
    await userEvent.type(descriptionInput, "{backspace}".repeat(3));
    descriptionInput.blur();

    expect(onDescriptionChange.mock.calls).toEqual([[""]]);
    expect(descriptionInput).toHaveValue("");
  });

  it("should not call onNameChange if name is the same after trimming", async () => {
    const { onNameChange } = setup({ name: "xyz" });

    const nameInput = screen.getByPlaceholderText("Enter name");
    await userEvent.type(nameInput, "{backspace}z ");
    nameInput.blur();

    expect(onNameChange).toHaveBeenCalledTimes(0);
  });

  it("should not call onDescriptionChange if description is the same after trimming", async () => {
    const { onNameChange } = setup({ description: "xyz" });

    const nameInput = screen.getByPlaceholderText("Enter description");
    await userEvent.type(nameInput, "{backspace}z ");
    nameInput.blur();

    expect(onNameChange).toHaveBeenCalledTimes(0);
  });

  it("should show name prefix", async () => {
    setup({ namePrefix: "prefix" });

    expect(screen.getByText("prefix:")).toBeInTheDocument();
  });
});
