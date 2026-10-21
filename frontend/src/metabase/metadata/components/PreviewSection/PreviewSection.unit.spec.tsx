import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupCardDataset } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Field, Table } from "metabase-types/api";
import type { MockDatasetOpts } from "metabase-types/api/mocks";
import {
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersTotalField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { PreviewSection } from "./PreviewSection";
import type { PreviewType } from "./types";

registerVisualizations();

const ORDERS_TABLE = createOrdersTable();
const ORDERS_TOTAL_FIELD = createOrdersTotalField();

function TestComponent({
  field,
  table,
  onPreviewTypeChange,
}: {
  field: Field;
  table: Table;
  onPreviewTypeChange: (value: PreviewType) => void;
}) {
  const [previewType, setPreviewType] = useState<PreviewType>("table");

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
  status?: number;
  dataset?: MockDatasetOpts;
  field?: Field;
  table?: Table;
}

function setup({
  status = 200,
  dataset,
  field = ORDERS_TOTAL_FIELD,
  table = ORDERS_TABLE,
}: SetupOpts = {}) {
  setupCardDataset({ status, dataset });

  const onPreviewTypeChange = jest.fn();

  renderWithProviders(
    <TestComponent
      field={field}
      table={table}
      onPreviewTypeChange={onPreviewTypeChange}
    />,
    {
      // the preview query is built from the metadata store, so an empty store
      // means no request is ever issued
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
  );

  return { onPreviewTypeChange };
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

  describe("error handling", () => {
    it("shows an error in the table preview when the query fails", async () => {
      setup({ status: 500 });

      expect(await screen.findByText("Something went wrong")).toBeVisible();
    });

    it("shows an error in the object detail preview when the query fails", async () => {
      setup({ status: 500 });

      await userEvent.click(screen.getByLabelText("Detail"));

      expect(await screen.findByText("Something went wrong")).toBeVisible();
    });
  });

  describe("empty states", () => {
    beforeEach(() => {
      mockGetBoundingClientRect();
    });

    it("shows an empty state in the table and detail previews when the query returns no rows", async () => {
      setup({ dataset: { data: { rows: [] } } });

      expect(await screen.findByText("No data to show")).toBeVisible();

      await userEvent.click(screen.getByLabelText("Detail"));
      expect(await screen.findByText("No data to show")).toBeVisible();
    });

    it("does not show an empty state in the table and detail previews when the query returns rows", async () => {
      setup({ dataset: { data: { rows: [["Sample row value"]] } } });

      expect(await screen.findByText("Sample row value")).toBeInTheDocument();
      expect(screen.queryByText("No data to show")).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Detail"));
      expect(await screen.findByText("Sample row value")).toBeInTheDocument();
      expect(screen.queryByText("No data to show")).not.toBeInTheDocument();
    });
  });

  describe("filtering preview", () => {
    it("shows the filter picker for a field of a hidden table", async () => {
      const productIdField = createOrdersProductIdField();
      setup({
        field: productIdField,
        table: createOrdersTable({
          fields: [productIdField],
          visibility_type: "hidden",
        }),
      });

      await userEvent.click(screen.getByLabelText("Filtering"));

      expect(await screen.findByPlaceholderText("Enter an ID")).toBeVisible();
      expect(
        screen.queryByText("Something’s gone wrong"),
      ).not.toBeInTheDocument();
    });
  });
});
