import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen, getIcon } from "__support__/ui";
import type { FieldType, FieldValueOptions } from "metabase-types/api";

import type { OptionEditorProps } from "./OptionEditor";
import { OptionPopover, textToOptions } from "./OptionEditor";

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

  await userEvent.click(getIcon("list"));
  await userEvent.unhover(getIcon("list"));
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

      await userEvent.type(input, options.join("\n"));
      await userEvent.click(saveButton);

      expect(input).toHaveValue(options.join("\n"));
      expect(saveButton).toBeDisabled();
      expect(onChange).toHaveBeenCalledWith(options);
    });

    it("should close popover on save", async () => {
      const { input, saveButton } = await setup({ options: [] });

      await userEvent.type(input, options.join("\n"));
      await userEvent.click(saveButton);

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  describe("given number field type", () => {
    it("should validate values", async () => {
      const { input, saveButton, onChange } = await baseSetup({
        fieldType: "number",
      });

      await userEvent.type(input, "foo\nbar");
      await userEvent.click(saveButton);

      expect(screen.getByText("Invalid number format")).toBeInTheDocument();
      expect(saveButton).toBeDisabled();
      expect(onChange).not.toHaveBeenCalled();

      await userEvent.clear(input);
      expect(
        screen.queryByText("Invalid number format"),
      ).not.toBeInTheDocument();

      await userEvent.type(input, "1\n2");
      await userEvent.click(saveButton);

      expect(onChange).toHaveBeenCalledWith([1, 2]);
    });

    it("should omit empty lines and duplicates", async () => {
      const { input, saveButton, onChange } = await baseSetup({
        fieldType: "number",
        options: [],
      });

      await userEvent.type(input, "1\n2\n\n2\n\n1\n\n");
      await userEvent.click(saveButton);

      expect(onChange).toHaveBeenCalledWith([1, 2]);
    });

    describe("given string field type", () => {
      it("should omit empty lines and duplicates", async () => {
        const { input, saveButton, onChange } = await baseSetup({
          fieldType: "string",
          options: [],
        });

        await userEvent.type(input, "1\n2\n\n2\n\n1\n\n");
        await userEvent.click(saveButton);

        expect(onChange).toHaveBeenCalledWith(["1", "2"]);
      });
    });
  });
});

describe("textToOptions", () => {
  it("should filter duplicates", () => {
    const input = "1\n2\n1\n1\n2";

    expect(textToOptions(input)).toEqual(["1", "2"]);
  });

  it("should filter empty values and trim empty space", () => {
    const input = " \n  1\n2 \n\n\n  ";

    expect(textToOptions(input)).toEqual(["1", "2"]);
  });
});
