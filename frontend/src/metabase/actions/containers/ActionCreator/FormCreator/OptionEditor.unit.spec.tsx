import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon } from "__support__/ui";
import type { FieldType, FieldValueOptions } from "metabase-types/api";
import { OptionPopover, OptionEditorProps } from "./OptionEditor";

async function baseSetup({
  fieldType = "string",
  options: initialOptions = [],
  onChange = jest.fn(),
}: Partial<OptionEditorProps> = {}) {
  function UncontrolledOptionEditor() {
    const [options, setOptions] = useState(initialOptions);
    return (
      <OptionPopover
        fieldType={fieldType}
        options={options}
        onChange={(nextOptions: FieldValueOptions) => {
          setOptions(nextOptions);
          onChange(nextOptions);
        }}
      />
    );
  }

  render(<UncontrolledOptionEditor />);

  userEvent.click(getIcon("list"));
  await screen.findByRole("tooltip");

  const input = screen.getByPlaceholderText("Enter one option per line");
  const saveButton = screen.getByRole("button", { name: "Save" });

  return { input, saveButton, onChange };
}

const DEFAULT_STRING_OPTIONS = ["foo", "bar"];
const DEFAULT_NUMBER_OPTIONS = [-5, 0, 5];

type TestCase = [FieldType, FieldValueOptions];

describe("OptionEditor", () => {
  describe.each<TestCase>([
    ["string", DEFAULT_STRING_OPTIONS],
    ["number", DEFAULT_NUMBER_OPTIONS],
  ])("given %s field type", (fieldType, options) => {
    const setup = (options: Partial<OptionEditorProps> = {}) =>
      baseSetup({ ...options, fieldType });

    it("should render an empty state correctly", async () => {
      const { input, saveButton } = await setup({ options: [] });
      expect(input).toHaveValue("");
      expect(saveButton).toBeDisabled();
    });

    it("should render initial value correctly", async () => {
      const { input, saveButton } = await setup({ options });
      expect(input).toHaveValue(options.join("\n"));
      expect(saveButton).toBeDisabled();
    });

    it("should handle changes correctly", async () => {
      const { input, saveButton, onChange } = await setup({ options: [] });

      userEvent.type(input, options.join("\n"));
      userEvent.click(saveButton);

      expect(input).toHaveValue(options.join("\n"));
      expect(saveButton).toBeDisabled();
      expect(onChange).toHaveBeenCalledWith(options);
    });

    it("should close popover on save", async () => {
      const { input, saveButton } = await setup({ options: [] });

      userEvent.type(input, options.join("\n"));
      userEvent.click(saveButton);

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  describe("given number field type", () => {
    it("should validate values", async () => {
      const { input, saveButton, onChange } = await baseSetup({
        fieldType: "number",
      });

      userEvent.type(input, "foo\nbar");
      userEvent.click(saveButton);

      expect(screen.getByText("Invalid number format")).toBeInTheDocument();
      expect(saveButton).toBeDisabled();
      expect(onChange).not.toHaveBeenCalled();

      userEvent.clear(input);
      expect(
        screen.queryByText("Invalid number format"),
      ).not.toBeInTheDocument();

      userEvent.type(input, "1\n2");
      userEvent.click(saveButton);

      expect(onChange).toHaveBeenCalledWith([1, 2]);
    });
  });
});
