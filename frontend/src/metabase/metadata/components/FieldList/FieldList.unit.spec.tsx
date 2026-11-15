import { createMockField } from "metabase-types/api/mocks";

import { areFieldItemPropsEqual } from "./FieldItem";

describe("areFieldItemPropsEqual", () => {
  const onNameChange = jest.fn();
  const onDescriptionChange = jest.fn();

  it("keeps field items memoized when rendered field data did not change", () => {
    const field = createMockField({
      id: 1,
      name: "field_1",
      display_name: "Field 1",
      position: 1,
    });
    const nextField = { ...field };

    expect(
      areFieldItemPropsEqual(
        {
          field,
          href: "/field/1",
          onNameChange,
          onDescriptionChange,
        },
        {
          field: nextField,
          href: "/field/1",
          onNameChange,
          onDescriptionChange,
        },
      ),
    ).toBe(true);
  });

  it("rerenders field items when rendered field data changes", () => {
    const field = createMockField({
      id: 1,
      name: "field_1",
      display_name: "Field 1",
      position: 1,
    });
    const nextField = { ...field, semantic_type: "type/Category" };

    expect(
      areFieldItemPropsEqual(
        {
          field,
          href: "/field/1",
          onNameChange,
          onDescriptionChange,
        },
        {
          field: nextField,
          href: "/field/1",
          onNameChange,
          onDescriptionChange,
        },
      ),
    ).toBe(false);
  });
});
