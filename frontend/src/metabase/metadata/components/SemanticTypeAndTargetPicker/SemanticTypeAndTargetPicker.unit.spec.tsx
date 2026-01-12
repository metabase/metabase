import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";
import {
  createOrdersProductIdField,
  createOrdersTotalField,
  createProductsIdField,
} from "metabase-types/api/mocks/presets";

import { SemanticTypeAndTargetPicker } from "./SemanticTypeAndTargetPicker";

function setup({
  field = createOrdersTotalField(),
  idFields = [createProductsIdField()],
}: {
  field?: Field;
  idFields?: Field[];
} = {}) {
  const onChange = jest.fn();

  render(
    <SemanticTypeAndTargetPicker
      field={field}
      idFields={idFields}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("SemanticTypeAndTargetPicker", () => {
  it("should not show currency picker or foreign key target picker when not necessary", () => {
    setup();

    expect(
      screen.getByPlaceholderText("Select a semantic type"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select a currency type"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select a target"),
    ).not.toBeInTheDocument();
  });

  it("should show currency picker for currency fields", () => {
    setup({
      field: createOrdersTotalField({
        semantic_type: "type/Currency",
      }),
    });

    expect(
      screen.getByPlaceholderText("Select a semantic type"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Select a currency type"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select a target"),
    ).not.toBeInTheDocument();
  });

  it("should show foreign key target picker for FK fields", () => {
    setup({
      field: createOrdersProductIdField(),
    });

    expect(
      screen.getByPlaceholderText("Select a semantic type"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select a currency type"),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Select a target")).toBeInTheDocument();
  });

  it("should call onChange with correct values for semantic type change", async () => {
    const { onChange } = setup();

    const select = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(select);
    await userEvent.click(screen.getByText("Quantity"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semantic_type: "type/Quantity" }),
    );
  });

  it("should call onChange with correct values for currency change", async () => {
    const { onChange } = setup({
      field: createOrdersTotalField({
        semantic_type: "type/Currency",
      }),
    });

    const select = screen.getByPlaceholderText("Select a currency type");
    await userEvent.click(select);
    await userEvent.click(screen.getByText("Canadian Dollar"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { currency: "CAD" } }),
    );
  });

  it("should call onChange with correct values for FK target change", async () => {
    const { onChange } = setup({
      field: createOrdersProductIdField({
        fk_target_field_id: null,
      }),
    });

    const select = screen.getByPlaceholderText("Select a target");
    await userEvent.click(select);
    await userEvent.click(screen.getByText("ID"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fk_target_field_id: getRawTableFieldId(createProductsIdField()),
      }),
    );
  });

  it("should unset fk_target_field_id when changing FK semantic type to something else", async () => {
    const { onChange } = setup({
      field: createOrdersProductIdField(),
    });

    const select = screen.getByPlaceholderText("Select a semantic type");
    await userEvent.click(select);
    await userEvent.click(screen.getByText("Quantity"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fk_target_field_id: null,
      }),
    );
  });
});
