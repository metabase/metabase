import React, { useState } from "react";
import userEvent from "@testing-library/user-event";
import {
  render,
  screen,
  getIcon,
  queryIcon,
  waitFor,
  within,
} from "__support__/ui";
import FormProvider from "metabase/core/components/FormProvider";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import type { FieldSettings } from "metabase-types/api";
import FormFieldEditor, { FormFieldEditorProps } from "./FormFieldEditor";

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
    expect(getIcon("grabber2")).toBeInTheDocument();
  });

  it("handles field type change", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText("Date"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...getDefaultFieldSettings(),
      fieldType: "date",
      inputType: "date",
    });

    userEvent.click(screen.getByText("Number"));

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
    expect(queryIcon("grabber2")).not.toBeInTheDocument();
  });

  it("formats value options when switching between field and input types", async () => {
    const initialSettings: FieldSettings = {
      ...getDefaultFieldSettings(),
      fieldType: "string",
      inputType: "select",
      valueOptions: ["1", "2", "3", "not-a-number"],
    };
    const { onChange } = setup({ fieldSettings: initialSettings });

    userEvent.click(screen.getByLabelText("Field settings"));
    const popover = await screen.findByRole("tooltip");

    userEvent.click(
      await within(popover).findByRole("radio", { name: "Text" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...initialSettings,
      inputType: "string",
    });

    userEvent.click(
      await within(popover).findByRole("radio", { name: "Inline select" }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ...initialSettings,
        inputType: "radio",
      }),
    );

    userEvent.click(screen.getByText("Category"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ...initialSettings,
        fieldType: "category",
        inputType: "radio",
      }),
    );

    userEvent.click(screen.getByText("Number"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        ...initialSettings,
        fieldType: "number",
        inputType: "radio",
        valueOptions: [1, 2, 3],
      }),
    );
  });
});
