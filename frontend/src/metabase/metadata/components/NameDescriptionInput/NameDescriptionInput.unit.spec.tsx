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
  describe("name", () => {
    it('should trigger "onNameChange" on name input blur', async () => {
      const { onNameChange } = setup();

      const nameInput = screen.getByPlaceholderText("Enter name");
      nameInput.blur();

      // should not be triggered if value hasn't changed
      expect(onNameChange).toHaveBeenCalledTimes(0);

      await userEvent.type(nameInput, "test");
      nameInput.blur();

      expect(onNameChange).toHaveBeenCalledTimes(1);
      expect(onNameChange.mock.calls).toEqual([["test"]]);
    });

    it("should not allow empty names", async () => {
      const { onNameChange } = setup({ name: "xyz" });

      const nameInput = screen.getByPlaceholderText("Enter name");
      await userEvent.type(nameInput, "{backspace}".repeat(3));
      nameInput.blur();

      expect(onNameChange).toHaveBeenCalledTimes(0);
    });

    it("should show pencil icon on hover but not when focused", async () => {
      setup();

      const nameInput = screen.getByPlaceholderText("Enter name");

      await userEvent.hover(nameInput);
      expect(screen.getByLabelText("pencil icon")).toBeInTheDocument();

      await userEvent.click(nameInput);
      expect(screen.queryByLabelText("pencil icon")).not.toBeInTheDocument();
    });
  });

  describe("description", () => {
    it('should trigger "onDescriptionChange" on description input blur', async () => {
      const { onDescriptionChange } = setup();

      const descriptionInput = screen.getByPlaceholderText("Enter description");
      descriptionInput.blur();

      // should not be triggered if value hasn't changed
      expect(onDescriptionChange).toHaveBeenCalledTimes(0);

      await userEvent.type(descriptionInput, "test");
      descriptionInput.blur();

      expect(onDescriptionChange).toHaveBeenCalledTimes(1);
      expect(onDescriptionChange.mock.calls).toEqual([["test"]]);
    });

    it("should allow empty description", async () => {
      const { onDescriptionChange } = setup({ description: "xyz" });

      const descriptionInput = screen.getByPlaceholderText("Enter description");
      await userEvent.type(descriptionInput, "{backspace}".repeat(3));
      descriptionInput.blur();

      expect(onDescriptionChange.mock.calls).toEqual([[""]]);
      expect(descriptionInput).toHaveValue("");
    });

    it("should show pencil icon on hover but not when focused", async () => {
      setup();

      const descriptionInput = screen.getByPlaceholderText("Enter description");

      await userEvent.hover(descriptionInput);
      expect(screen.getByLabelText("pencil icon")).toBeInTheDocument();

      await userEvent.click(descriptionInput);
      expect(screen.queryByLabelText("pencil icon")).not.toBeInTheDocument();
    });
  });
});
