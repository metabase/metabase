import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon, queryIcon } from "__support__/ui";
import FormProvider from "metabase/core/components/FormProvider";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import FormFieldEditor, { FormFieldEditorProps } from "./FormFieldEditor";

const DEFAULT_FIELD: FormFieldEditorProps["field"] = {
  name: "uuid",
  title: "First Name",
  type: "text",
};

function setup({
  field = DEFAULT_FIELD,
  fieldSettings = getDefaultFieldSettings(),
  isEditable = true,
  onChange = jest.fn(),
}: Partial<FormFieldEditorProps> = {}) {
  render(
    <FormProvider initialValues={{}} onSubmit={jest.fn()}>
      <FormFieldEditor
        field={field}
        fieldSettings={fieldSettings}
        isEditable={isEditable}
        onChange={onChange}
      />
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
});
