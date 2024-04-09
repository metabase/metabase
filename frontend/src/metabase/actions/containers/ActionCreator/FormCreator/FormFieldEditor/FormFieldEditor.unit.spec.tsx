import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  getIcon,
  queryIcon,
  render,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import { FormProvider } from "metabase/forms";
import type { FieldSettings } from "metabase-types/api";

import type { FormFieldEditorProps } from "./FormFieldEditor";
import FormFieldEditor from "./FormFieldEditor";

const DEFAULT_FIELD: FormFieldEditorProps["field"] = {
  name: "uuid",
  title: "First Name",
  type: "text",
};

function setup({
  field = DEFAULT_FIELD,
  fieldSettings: initialFieldSettings = getDefaultFieldSettings(),
  isEditable = true,
  onChange = jest.fn(),
}: Partial<FormFieldEditorProps> = {}) {
  function WrappedFormFieldEditor() {
    const [fieldSettings, setFieldSettings] = useState(initialFieldSettings);
    return (
      <FormFieldEditor
        field={field}
        fieldSettings={fieldSettings}
        isEditable={isEditable}
        onChange={nextFieldSettings => {
          onChange(nextFieldSettings);
          setFieldSettings(nextFieldSettings);
        }}
      />
    );
  }

  render(
    <FormProvider initialValues={{}} onSubmit={jest.fn()}>
      <WrappedFormFieldEditor />
    </FormProvider>,
  );

  return { onChange };
}

describe("FormFieldEditor", () => {
  it("renders correctly", () => {
    const field = {
      ...DEFAULT_FIELD,
      description: "Well, it's a first name",
      placeholder: "John Doe",
    };
    setup({ field });

    expect(screen.getByLabelText(field.title)).toBeInTheDocument();
    expect(screen.getByText(field.description)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(field.placeholder)).toBeInTheDocument();
    expect(screen.getByLabelText("Field settings")).toBeInTheDocument();
    expect(getIcon("grabber")).toBeInTheDocument();
  });

  it("handles field type change", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Date"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...getDefaultFieldSettings(),
      fieldType: "date",
      inputType: "date",
    });

    await userEvent.click(screen.getByText("Number"));

    expect(onChange).toHaveBeenLastCalledWith({
      ...getDefaultFieldSettings(),
      fieldType: "number",
      inputType: "number",
    });
  });

  it("respects uneditable state", () => {
    setup({ isEditable: false });

    expect(screen.queryByText("Field type")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "Field type" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
    expect(queryIcon("grabber")).not.toBeInTheDocument();
  });

  describe("field values", () => {
    const TEST_STRING_FIELD_SETTINGS: FieldSettings = {
      ...getDefaultFieldSettings(),
      fieldType: "string",
      inputType: "select",
      valueOptions: ["1", "2", "3", "not-a-number"],
    };

    it("keeps value options when switching between input types", async () => {
      const { onChange } = setup({ fieldSettings: TEST_STRING_FIELD_SETTINGS });
      await userEvent.click(screen.getByLabelText("Field settings"));
      await userEvent.unhover(screen.getByLabelText("Field settings"));
      const popover = await screen.findByRole("tooltip");

      await userEvent.click(
        within(popover).getByRole("radio", { name: "Text" }),
      );
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith({
          ...TEST_STRING_FIELD_SETTINGS,
          inputType: "string",
        }),
      );

      await userEvent.click(
        within(popover).getByRole("radio", { name: "Inline select" }),
      );
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith({
          ...TEST_STRING_FIELD_SETTINGS,
          inputType: "radio",
        }),
      );
    });

    it("handles value options when switching between field types", async () => {
      const { onChange } = setup({ fieldSettings: TEST_STRING_FIELD_SETTINGS });

      await userEvent.click(screen.getByText("Number"));
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith({
          ...TEST_STRING_FIELD_SETTINGS,
          fieldType: "number",
          valueOptions: [1, 2, 3],
        }),
      );

      await userEvent.click(screen.getByText("Date"));
      await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith({
          ...TEST_STRING_FIELD_SETTINGS,
          fieldType: "date",
          inputType: "date",
          valueOptions: undefined,
        }),
      );
    });
  });

  describe("default values", () => {
    it("keeps default value when converting between input types", async () => {
      const fieldSettings = getDefaultFieldSettings({
        fieldType: "string",
        inputType: "string",
        defaultValue: "default",
      });

      const { onChange } = setup({ fieldSettings });

      await userEvent.click(screen.getByLabelText("Field settings"));
      await userEvent.unhover(screen.getByLabelText("Field settings"));
      expect(await screen.findByRole("tooltip")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("radio", { name: "Long text" }));

      expect(onChange).toHaveBeenLastCalledWith({
        ...fieldSettings,
        inputType: "text",
        defaultValue: "default",
      });
    });

    it("handles default value when switching between field types", async () => {
      const fieldSettings = getDefaultFieldSettings({
        fieldType: "string",
        inputType: "text",
        defaultValue: "123",
        valueOptions: undefined,
      });

      const { onChange } = setup({ fieldSettings });
      await userEvent.click(screen.getByLabelText("Field settings"));
      await userEvent.unhover(screen.getByLabelText("Field settings"));
      expect(await screen.findByRole("tooltip")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Number"));
      expect(onChange).toHaveBeenLastCalledWith({
        ...fieldSettings,
        fieldType: "number",
        inputType: "number",
        defaultValue: 123,
      });

      await userEvent.click(screen.getByText("Date"));
      expect(onChange).toHaveBeenLastCalledWith({
        ...fieldSettings,
        fieldType: "date",
        inputType: "date",
        defaultValue: undefined,
      });
    });
  });
});
