import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import { useState } from "react";

import {
  setupAdhocQueryEndpoint,
  setupCardDataset,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersTable,
  createOrdersTotalField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import { PreviewSection } from "./PreviewSection";
import type { PreviewType } from "./types";

registerVisualizations();

const table = createOrdersTable();
const field = createOrdersTotalField();

function TestComponent({
  onPreviewTypeChange,
}: {
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

function setup({ status = 200 }: { status?: number } = {}) {
  setupCardDataset({ status });
  return renderPreviewSection();
}

// TOTAL is not the first field of ORDERS, so a query built for the wrong field
// (or for the whole table) would not match the routes below.
const ID_COLUMN = createMockColumn({
  id: ORDERS.ID,
  name: "ID",
  display_name: "ID",
  base_type: "type/BigInteger",
  semantic_type: "type/PK",
});
const TOTAL_COLUMN = createMockColumn({
  id: ORDERS.TOTAL,
  name: "TOTAL",
  display_name: "Total",
  base_type: "type/Float",
});
const TOTAL_VALUE = 39.72;
const PREVIEW_LIMIT = 50;

type PreviewMode = "table" | "detail";

function getFieldId(clause: unknown): unknown {
  return Array.isArray(clause) && clause[0] === "field" ? clause[2] : undefined;
}

function isNotNullFilterOnTotal(filters: unknown) {
  if (!Array.isArray(filters) || filters.length !== 1) {
    return false;
  }
  const [filter] = filters;
  return (
    Array.isArray(filter) &&
    filter[0] === "not-null" &&
    getFieldId(filter[2]) === ORDERS.TOTAL
  );
}

function getPreviewMode(callLog: CallLog): PreviewMode | undefined {
  const body: unknown = JSON.parse(String(callLog.options.body));
  if (!isObject(body) || !Array.isArray(body.stages)) {
    return undefined;
  }
  const [stage] = body.stages;
  if (
    !isObject(stage) ||
    stage["source-table"] !== ORDERS_ID ||
    !isNotNullFilterOnTotal(stage.filters)
  ) {
    return undefined;
  }

  const isTotalOnly =
    Array.isArray(stage.fields) &&
    stage.fields.length === 1 &&
    getFieldId(stage.fields[0]) === ORDERS.TOTAL;
  if (isTotalOnly && stage.limit === PREVIEW_LIMIT) {
    return "table";
  }
  if (stage.fields === undefined && stage.limit === undefined) {
    return "detail";
  }
  return undefined;
}

function setupPreviewDatasetEndpoint(
  mode: PreviewMode,
  cols: DatasetColumn[],
  rows: RowValue[][],
) {
  setupAdhocQueryEndpoint(createMockDataset({ data: { cols, rows } }), {
    name: `preview-${mode}`,
    matcherFunction: (callLog) => getPreviewMode(callLog) === mode,
    delay: 300,
  });
}

function setupWithData({ hasRows }: { hasRows: boolean }) {
  setupPreviewDatasetEndpoint(
    "table",
    [TOTAL_COLUMN],
    hasRows ? [[TOTAL_VALUE]] : [],
  );
  setupPreviewDatasetEndpoint(
    "detail",
    [ID_COLUMN, TOTAL_COLUMN],
    hasRows ? [[1, TOTAL_VALUE]] : [],
  );
  return renderPreviewSection();
}

function renderPreviewSection() {
  const onPreviewTypeChange = jest.fn();

  renderWithProviders(
    <TestComponent onPreviewTypeChange={onPreviewTypeChange} />,
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

  describe("empty data", () => {
    it("shows an empty state in the table and detail previews when the table has no rows", async () => {
      setupWithData({ hasRows: false });

      expect(await screen.findByText("No data to show")).toBeVisible();
      expect(fetchMock.callHistory.calls("preview-table")).toHaveLength(1);

      await userEvent.click(screen.getByLabelText("Detail"));

      await waitFor(() =>
        expect(fetchMock.callHistory.calls("preview-detail")).toHaveLength(1),
      );
      expect(await screen.findByText("No data to show")).toBeVisible();
      expect(screen.queryByText("Total")).not.toBeInTheDocument();
    });

    it("shows the value in the table and detail previews when the table has a row", async () => {
      setupWithData({ hasRows: true });

      // jsdom has no layout, so the virtualized grid renders no cells;
      // the table root still reports how many rows it received
      expect(await screen.findByRole("grid")).toBeInTheDocument();
      expect(screen.getByTestId("table-root")).toHaveAttribute(
        "data-rows-count",
        "1",
      );
      expect(fetchMock.callHistory.calls("preview-table")).toHaveLength(1);
      expect(screen.queryByText("No data to show")).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Detail"));

      await waitFor(() =>
        expect(fetchMock.callHistory.calls("preview-detail")).toHaveLength(1),
      );
      expect(await screen.findByText(String(TOTAL_VALUE))).toBeVisible();
      expect(screen.queryByText("No data to show")).not.toBeInTheDocument();
    });
  });
});
