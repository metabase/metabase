import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockField } from "metabase-types/api/mocks";

import Field from "./Field";

const createFormFieldEntry = (name: string) => ({
  name,
  onChange: jest.fn(),
});

const createFormFields = () => ({
  display_name: createFormFieldEntry("1.display_name"),
  description: createFormFieldEntry("1.description"),
  semantic_type: createFormFieldEntry("1.semantic_type"),
  fk_target_field_id: createFormFieldEntry("1.fk_target_field_id"),
  settings: createFormFieldEntry("1.settings"),
});

interface SetupOpts {
  isEditing?: boolean;
  description?: string | null;
}

const setup = ({ isEditing = false, description = null }: SetupOpts = {}) => {
  const formField = createFormFields();
  const field = createMockField({ id: 1, description });

  renderWithProviders(
    <Field
      databaseId={1}
      field={field}
      url="/reference/databases/1/tables/1/fields/1"
      isEditing={isEditing}
      // The reference module is loosely typed; the form field shape mirrors
      // what FieldList's getNestedFormField produces at runtime.
      formField={formField as any}
    />,
  );

  return { formField };
};

describe("reference > Field (metabase#37907)", () => {
  it("renders an editable description input in edit mode", () => {
    setup({ isEditing: true, description: "The total billed amount." });

    const input = screen.getByPlaceholderText("No column description yet");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("The total billed amount.");
  });

  it("wires the description input to the form field so edits are captured", async () => {
    const { formField } = setup({ isEditing: true, description: "" });

    const input = screen.getByPlaceholderText("No column description yet");
    await userEvent.type(input, "New description");

    expect(formField.description.onChange).toHaveBeenCalled();
  });

  it("renders the description as static text (not editable) when not editing", () => {
    setup({ isEditing: false, description: "The total billed amount." });

    expect(screen.getByText("The total billed amount.")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("No column description yet"),
    ).not.toBeInTheDocument();
  });
});
