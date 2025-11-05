import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { FkTargetPicker } from "./FkTargetPicker";

const FIELD = createMockField({
  id: getNextId(),
  display_name: "Field 1",
});

const TABLE_SCHEMA_PUBLIC = createMockTable({
  id: getNextId(),
  schema: "public",
  display_name: "Table 1",
});

const TABLE_SCHEMA_OTHER = createMockTable({
  id: getNextId(),
  schema: "other",
  display_name: "Table 2",
});

const ID_FIELD_1 = createMockField({
  id: getNextId(),
  display_name: "Field A",
  description: "Description A",
  table: TABLE_SCHEMA_PUBLIC,
});

const ID_FIELD_2 = createMockField({
  id: getNextId(),
  display_name: "Field B",
  description: "Description B",
  table: TABLE_SCHEMA_OTHER,
});

const ID_FIELDS = [ID_FIELD_1, ID_FIELD_2];

interface SetupOpts {
  field?: Field;
  idFields?: Field[];
  value?: FieldId | null;
}

function setup({
  field = FIELD,
  idFields = ID_FIELDS,
  value = null,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  const { rerender } = render(
    <FkTargetPicker
      field={field}
      idFields={idFields}
      value={value}
      onChange={onChange}
    />,
  );

  return { rerender, onChange };
}

describe("FkTargetPicker", () => {
  it("should show empty state when there are no idFields", async () => {
    setup({ idFields: [] });

    const select = screen.getByPlaceholderText("No key available");
    await userEvent.click(select);

    expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
  });

  it("should render options with label, description, and icon", async () => {
    setup();
    const select = screen.getByPlaceholderText("Select a target");
    await userEvent.click(select);

    expect(screen.getByText("Public.Table 1 → Field A")).toBeInTheDocument();
    expect(screen.getByText("Description A")).toBeInTheDocument();
    expect(screen.getByText("Other.Table 2 → Field B")).toBeInTheDocument();
    expect(screen.getByText("Description B")).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("calls onChange when a different field is selected", async () => {
    const { onChange } = setup({ value: getRawTableFieldId(ID_FIELD_1) });

    await userEvent.click(screen.getByPlaceholderText("Select a target"));
    await userEvent.click(screen.getByText("Other.Table 2 → Field B"));
    expect(onChange).toHaveBeenCalledWith(getRawTableFieldId(ID_FIELD_2));
  });

  it("does not call onChange when the same field is selected", async () => {
    const { onChange } = setup({ value: getRawTableFieldId(ID_FIELD_1) });

    await userEvent.click(screen.getByPlaceholderText("Select a target"));
    await userEvent.click(screen.getByText("Public.Table 1 → Field A"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should filter options using based on label and description", async () => {
    setup();

    const select = screen.getByPlaceholderText("Select a target");
    await userEvent.click(select);

    // Should show both options initially
    expect(screen.getByText("Public.Table 1 → Field A")).toBeInTheDocument();
    expect(screen.getByText("Other.Table 2 → Field B")).toBeInTheDocument();

    // Filter by label case-insensitive
    await userEvent.type(select, "tAbLe 1");
    expect(screen.getByText("Public.Table 1 → Field A")).toBeInTheDocument();
    expect(
      screen.queryByText("Other.Table 2 → Field B"),
    ).not.toBeInTheDocument();

    // Filter by description case-insensitive
    await userEvent.clear(select);
    await userEvent.type(select, "DeScRiPtIoN B");
    expect(screen.getByText("Other.Table 2 → Field B")).toBeInTheDocument();
    expect(
      screen.queryByText("Public.Table 1 → Field A"),
    ).not.toBeInTheDocument();
  });

  it("should include schema in the label if there are multiple schemas", async () => {
    setup();

    const select = screen.getByPlaceholderText("Select a target");
    await userEvent.click(select);

    expect(screen.getByText("Public.Table 1 → Field A")).toBeInTheDocument();
    expect(screen.getByText("Other.Table 2 → Field B")).toBeInTheDocument();
  });

  it("should not include schema in the label if all fields have the same schema", async () => {
    setup({
      idFields: [ID_FIELD_1],
    });

    const select = screen.getByPlaceholderText("Select a target");
    await userEvent.click(select);

    expect(screen.getByText("Table 1 → Field A")).toBeInTheDocument();
  });

  it("should show special placeholder when no access", () => {
    setup({
      field: createMockField({
        ...FIELD,
        semantic_type: "type/FK",
        fk_target_field_id: getNextId(),
      }),
    });

    expect(
      screen.getByPlaceholderText("Field access denied"),
    ).toBeInTheDocument();
  });
});
