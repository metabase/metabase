import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Field, Table } from "metabase-types/api";
import {
  createMockDataset,
  createMockFieldValues,
} from "metabase-types/api/mocks";
import {
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersTaxField,
  createOrdersTotalField,
} from "metabase-types/api/mocks/presets";

import { PreviewSection } from "./PreviewSection";
import type { PreviewType } from "./types";

registerVisualizations();

function TestComponent({
  field,
  table,
  initialPreviewType,
  onPreviewTypeChange,
}: {
  field: Field;
  table: Table;
  initialPreviewType: PreviewType;
  onPreviewTypeChange: (value: PreviewType) => void;
}) {
  const [previewType, setPreviewType] =
    useState<PreviewType>(initialPreviewType);

  function handlePreviewTypeChange(previewType: PreviewType) {
    onPreviewTypeChange(previewType);
    setPreviewType(previewType);
  }

  return (
    <PreviewSection
      field={field}
      table={table}
      previewType={previewType}
      onPreviewTypeChange={handlePreviewTypeChange}
      onClose={jest.fn()}
    />
  );
}

interface SetupOpts {
  field?: Field;
  table?: Table;
  initialPreviewType?: PreviewType;
}

function setup({
  field = createOrdersTotalField(),
  table = createOrdersTable(),
  initialPreviewType = "table",
}: SetupOpts = {}) {
  fetchMock.post(
    "path:/api/dataset",
    createMockDataset({ data: { rows: [] } }),
  );

  const onPreviewTypeChange = jest.fn();

  const { rerender } = renderWithProviders(
    <TestComponent
      field={field}
      table={table}
      initialPreviewType={initialPreviewType}
      onPreviewTypeChange={onPreviewTypeChange}
    />,
  );

  return { onPreviewTypeChange, rerender };
}

describe("PreviewSection", () => {
  it("should be possible to change the preview type", async () => {
    const { onPreviewTypeChange } = setup();

    await userEvent.click(screen.getByLabelText("Detail"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("detail");

    await userEvent.click(screen.getByLabelText("Filtering"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("filtering");

    await userEvent.click(screen.getByLabelText("Table"));
    expect(onPreviewTypeChange).toHaveBeenCalledWith("table");
  });

  it("should show an empty state in table and detail previews when the table has no rows", async () => {
    setup();

    const previewSection = screen.getByTestId("preview-section");
    expect(
      await within(previewSection).findByText("No data to show"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Detail"));
    expect(
      await within(previewSection).findByText("No data to show"),
    ).toBeInTheDocument();
  });

  it.each([
    {
      field: createOrdersProductIdField({ has_field_values: "none" }),
      placeholder: "Enter an ID",
    },
    {
      field: createOrdersProductIdField({ has_field_values: "list" }),
      placeholder: "Search the list",
    },
    {
      field: createOrdersTaxField({ has_field_values: "none" }),
      placeholder: "Min",
    },
    {
      field: createOrdersTaxField({ has_field_values: "search" }),
      placeholder: "Enter a number",
    },
  ])(
    "should not auto-focus the '$placeholder' input in the filtering preview",
    async ({ field, placeholder }) => {
      setupFieldValuesEndpoint(
        createMockFieldValues({
          field_id: getRawTableFieldId(field),
          values: [[1], [2]],
        }),
      );
      const table = createOrdersTable();
      setup({
        field,
        table: {
          ...table,
          fields: table.fields?.map((tableField) =>
            tableField.id === field.id ? field : tableField,
          ),
        },
        initialPreviewType: "filtering",
      });

      const input = await screen.findByPlaceholderText(placeholder);
      expect(input).toBeInTheDocument();
      expect(input).not.toHaveFocus();
    },
  );

  it("should render the filtering preview of a hidden table", async () => {
    setup({
      field: createOrdersProductIdField(),
      table: createOrdersTable({ visibility_type: "hidden" }),
      initialPreviewType: "filtering",
    });

    expect(
      await screen.findByPlaceholderText("Enter an ID"),
    ).toBeInTheDocument();
  });
});
