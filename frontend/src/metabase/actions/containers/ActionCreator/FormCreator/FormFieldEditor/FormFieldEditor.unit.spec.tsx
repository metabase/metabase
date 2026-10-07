import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { getDefaultFieldSettings } from "metabase/actions/utils";
import { FormProvider } from "metabase/forms";

import type { FormFieldEditorProps } from "./FormFieldEditor";
import FormFieldEditor from "./FormFieldEditor";

const DEFAULT_FIELD: FormFieldEditorProps["field"] = {
  name: "uuid",
  title: "First Name",
  type: "text",
};

function setup({
  field = DEFAULT_FIELD,
  fieldSettings = getDefaultFieldSettings(),
}: Partial<FormFieldEditorProps> = {}) {
  const onChange = jest.fn();

  render(
    <FormProvider initialValues={{}} onSubmit={jest.fn()}>
      <FormFieldEditor
        field={field}
        fieldSettings={fieldSettings}
        onChange={onChange}
      />
    </FormProvider>,
  );

  return { onChange };
}

describe("FormFieldEditor", () => {
  it("renders a preview of the field", () => {
    const field = {
      ...DEFAULT_FIELD,
      description: "Well, it's a first name",
      placeholder: "John Doe",
    };
    setup({ field });

    expect(screen.getByLabelText(field.title)).toBeInTheDocument();
    expect(screen.getByText(field.description)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(field.placeholder)).toBeInTheDocument();
    expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
  });

  it("toggles the field visibility", async () => {
    const fieldSettings = getDefaultFieldSettings({ hidden: false });
    const { onChange } = setup({ fieldSettings });

    await userEvent.click(screen.getByLabelText("Show field"));

    expect(onChange).toHaveBeenCalledWith({ ...fieldSettings, hidden: true });
  });
});
