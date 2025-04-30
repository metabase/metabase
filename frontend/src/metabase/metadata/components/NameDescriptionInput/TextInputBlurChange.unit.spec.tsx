import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { TextInputBlurChange } from "./TextInputBlurChange";

interface SetupOpts {
  required?: boolean;
  value: string;
}

function setup({ required, value = "" }: Partial<SetupOpts> = {}) {
  const onChange = jest.fn();

  render(
    <TextInputBlurChange
      placeholder="Enter value"
      required={required}
      value={value}
      onChange={onChange}
    />,
  );

  return {
    onChange,
  };
}

describe("TextInputBlurChange", () => {
  describe("name", () => {
    it('should trigger "onChange" on name input blur', async () => {
      const { onChange } = setup();

      const input = screen.getByPlaceholderText("Enter value");
      input.blur();

      // should not be triggered if value hasn't changed
      expect(onChange).toHaveBeenCalledTimes(0);

      await userEvent.type(input, "test");
      input.blur();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls).toEqual([["test"]]);
    });

    it("should allow empty values when 'required' is false", async () => {
      const { onChange } = setup({ value: "xyz" });

      const input = screen.getByPlaceholderText("Enter value");
      await userEvent.type(input, "{backspace}".repeat(3));
      input.blur();

      expect(onChange.mock.calls).toEqual([[""]]);
      expect(input).toHaveValue("");
    });

    it("should not allow empty values when 'required' is true", async () => {
      const { onChange } = setup({ required: true, value: "xyz" });

      const input = screen.getByPlaceholderText("Enter value");
      await userEvent.type(input, "{backspace}".repeat(3));
      input.blur();

      expect(onChange).toHaveBeenCalledTimes(0);
    });

    it("should show pencil icon on hover but not when focused", async () => {
      setup();

      const input = screen.getByPlaceholderText("Enter value");

      await userEvent.hover(input);
      expect(screen.getByLabelText("pencil icon")).toBeInTheDocument();

      await userEvent.click(input);
      expect(screen.queryByLabelText("pencil icon")).not.toBeInTheDocument();
    });
  });
});
