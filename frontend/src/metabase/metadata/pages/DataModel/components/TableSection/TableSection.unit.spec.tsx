import { render, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";

import { TableSection } from "./TableSection";

const mockTable = {
  id: 1,
  name: "test_table",
  display_name: "Test Table",
  description: "Test table description",
  db_id: 1,
  schema: "public",
  field_order: "database",
  active: true,
  visibility_type: null,
  initial_sync_status: "complete",
  is_upload: false,
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z",
  fields: [
    {
      id: 1,
      name: "id",
      display_name: "ID",
      base_type: "type/Integer",
      semantic_type: "type/PK",
      table_id: 1,
      description: null,
      database_type: "INTEGER",
      active: true,
      visibility_type: "normal",
      has_field_values: "none",
      settings: null,
      fk_target_field_id: null,
      custom_position: 0,
      effective_type: "type/Integer",
      coercion_strategy: null,
      nfc_path: null,
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-01-01T00:00:00Z",
      preview_display: "text",
      position: 0,
      json_unfolding: null,
      fingerprint: null,
      last_analyzed: "2023-01-01T00:00:00Z",
    },
  ],
} as Table;

const mockParams = {
  databaseId: "1",
  schemaName: "public",
  tableId: "1",
  fieldId: "1",
};

describe("TableSection", () => {
  it("should render the external ActionIcon in the table name input", () => {
    const onSyncOptionsClick = jest.fn();

    render(
      <TableSection
        params={mockParams}
        table={mockTable}
        onSyncOptionsClick={onSyncOptionsClick}
      />,
    );

    // Check that the external icon is rendered
    const externalIcon = screen.getByLabelText("Explore this table");
    expect(externalIcon).toBeInTheDocument();

    // Check that the external icon is present
    const externalIconElement = screen.getByLabelText("external icon");
    expect(externalIconElement).toBeInTheDocument();
  });

  it("should render the table name input with the correct name", () => {
    const onSyncOptionsClick = jest.fn();

    render(
      <TableSection
        params={mockParams}
        table={mockTable}
        onSyncOptionsClick={onSyncOptionsClick}
      />,
    );

    // Check that the table name input is rendered with the correct value
    const nameInput = screen.getByDisplayValue("Test Table");
    expect(nameInput).toBeInTheDocument();
  });

  it("should render the table description input with the correct description", () => {
    const onSyncOptionsClick = jest.fn();

    render(
      <TableSection
        params={mockParams}
        table={mockTable}
        onSyncOptionsClick={onSyncOptionsClick}
      />,
    );

    // Check that the description input is rendered with the correct value
    const descriptionInput = screen.getByDisplayValue("Test table description");
    expect(descriptionInput).toBeInTheDocument();
  });
});
