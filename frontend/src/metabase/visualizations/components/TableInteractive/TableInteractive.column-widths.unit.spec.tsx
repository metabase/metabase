import { useState } from "react";

import {
  createMockDOMRect,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DatasetColumn,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockColumn,
  createMockDataset,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["table"]));

const GRID_WIDTH = 1200;
const GRID_HEIGHT = 400;
const HEADER_HEIGHT = 36;
const CHAR_WIDTH = 8;
const CELL_PADDING = 16;

/**
 * jsdom has no layout. The grid measures a hidden copy of the header and of
 * some cells to size the columns, so give every measured element a width from
 * its text. A body measure element holds one cell for each row, stacked, so it
 * is as wide as its widest cell.
 */
function getTextWidth(text: string | null) {
  return (text ?? "").length * CHAR_WIDTH + CELL_PADDING;
}

function mockLayout() {
  jest
    .spyOn(HTMLElement.prototype, "offsetWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      const type = this.dataset.measureType;
      if (type === "header") {
        return getTextWidth(this.textContent);
      }
      if (type === "body") {
        return Math.max(
          0,
          ...Array.from(this.children).map((child) =>
            getTextWidth(child.textContent),
          ),
        );
      }
      return 0;
    });

  // Gives every header its place in the header row, so that dnd-kit can find
  // the header under the pointer. Every other element fills the grid.
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      const header =
        this.getAttribute("role") === "columnheader"
          ? this
          : this.parentElement?.getAttribute("role") === "columnheader"
            ? this.parentElement
            : null;
      if (!(header instanceof HTMLElement)) {
        return createMockDOMRect({ width: GRID_WIDTH, height: GRID_HEIGHT });
      }
      const headers = Array.from(
        header.parentElement?.querySelectorAll<HTMLElement>(
          ":scope > [role=columnheader]",
        ) ?? [],
      );
      const left = headers
        .slice(0, headers.indexOf(header))
        .reduce((sum, el) => sum + parseFloat(el.style.width), 0);
      const width = parseFloat(header.style.width);
      return createMockDOMRect({
        x: left,
        y: 0,
        left,
        top: 0,
        width,
        height: HEADER_HEIGHT,
        right: left + width,
        bottom: HEADER_HEIGHT,
      });
    });
}

function getHeader(name: string) {
  return screen.getByRole("columnheader", { name });
}

function getColumnWidth(name: string) {
  return parseFloat(getHeader(name).style.width);
}

function getHeaderNames() {
  return screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent)
    .filter((name) => name !== "");
}

function resizeColumn(name: string, by: number) {
  const header = getHeader(name);
  const handle = within(header).getByTestId(/^resize-handle-/);
  const startX = getColumnWidth(name);
  fireEvent.mouseDown(handle, { button: 0, clientX: startX, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: startX + by / 2, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: startX + by, clientY: 10 });
  fireEvent.mouseUp(document, { clientX: startX + by, clientY: 10 });
}

function dragColumnOnto(name: string, targetName: string) {
  const handle = checkNotNull(
    getHeader(name).querySelector<HTMLElement>("[role=button]"),
  );
  const headerRect = getHeader(name).getBoundingClientRect();
  const targetRect = getHeader(targetName).getBoundingClientRect();
  const startX = headerRect.left + 10;
  const endX = targetRect.left + targetRect.width / 2;
  fireEvent.mouseDown(handle, { button: 0, clientX: startX, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: startX + 20, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: endX, clientY: 10 });
  fireEvent.mouseUp(document, { clientX: endX, clientY: 10 });
}

type SetupOpts = {
  cols: DatasetColumn[];
  rows: RowValues[];
  settings?: VisualizationSettings;
  isDashboard?: boolean;
};

/**
 * Renders the table and stores each settings update in the card, as the query
 * builder does with the card that the URL serializes.
 */
function setup({ cols, rows, settings = {}, isDashboard }: SetupOpts) {
  const onUpdateVisualizationSettings = jest.fn();
  let latestSettings = settings;

  const Container = ({ cols, rows }: Pick<SetupOpts, "cols" | "rows">) => {
    const [cardSettings, setCardSettings] = useState(settings);
    const handleUpdate = (update: VisualizationSettings) => {
      onUpdateVisualizationSettings(update);
      setCardSettings((prev) => {
        latestSettings = { ...prev, ...update };
        return latestSettings;
      });
    };
    const series = [
      {
        card: createMockCard({
          display: "table",
          query_type: "native",
          dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
            query: "select 1",
          }),
          visualization_settings: cardSettings,
        }),
        ...createMockDataset({ data: { cols, rows } }),
      },
    ];
    return (
      <Visualization
        rawSeries={series}
        width={GRID_WIDTH}
        height={GRID_HEIGHT}
        isDashboard={isDashboard}
        hasColumnReordering={!isDashboard}
        onUpdateVisualizationSettings={handleUpdate}
      />
    );
  };

  const { rerender, unmount } = renderWithProviders(
    <Container cols={cols} rows={rows} />,
  );

  return {
    onUpdateVisualizationSettings,
    getSettings: () => latestSettings,
    rerenderWith: (nextCols: DatasetColumn[], nextRows: RowValues[]) =>
      rerender(<Container cols={nextCols} rows={nextRows} />),
    unmount,
  };
}

describe("TableInteractive column widths", () => {
  beforeEach(() => {
    mockLayout();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("reordering", () => {
    const FIRST = createMockNumericColumn({
      name: "first_column",
      display_name: "first_column",
      source: "native",
    });
    const SECOND = createMockNumericColumn({
      name: "second_column",
      display_name: "second_column",
      source: "native",
    });

    it("should keep the width of each column after reordering, also with a width for one column only", async () => {
      const { getSettings, unmount } = setup({
        cols: [FIRST, SECOND],
        rows: [[1, 2]],
      });
      const measuredWidth = getTextWidth("second_column") + 2;
      await waitFor(() =>
        expect(getColumnWidth("second_column")).toBe(measuredWidth),
      );
      const firstMeasuredWidth = getTextWidth("first_column") + 2;
      expect(getColumnWidth("first_column")).toBe(firstMeasuredWidth);

      resizeColumn("first_column", 100);

      const resizedWidth = firstMeasuredWidth + 100;
      await waitFor(() =>
        expect(getColumnWidth("first_column")).toBe(resizedWidth),
      );
      // a width for the resized column only, shorter than the column count
      expect(getSettings()["table.column_widths"]).toEqual([resizedWidth]);

      dragColumnOnto("first_column", "second_column");

      await waitFor(() =>
        expect(getHeaderNames()).toEqual(["second_column", "first_column"]),
      );
      await waitFor(() =>
        expect(getSettings()["table.column_widths"]).toEqual([
          undefined,
          resizedWidth,
        ]),
      );
      expect(getSettings()["table.columns"]).toEqual([
        expect.objectContaining({ name: "second_column", enabled: true }),
        expect.objectContaining({ name: "first_column", enabled: true }),
      ]);
      expect(getColumnWidth("first_column")).toBe(resizedWidth);
      expect(getColumnWidth("second_column")).toBe(measuredWidth);

      // the stored card renders with the same widths, as after a reload
      const storedSettings = getSettings();
      unmount();
      setup({
        cols: [FIRST, SECOND],
        rows: [[1, 2]],
        settings: storedSettings,
      });
      await waitFor(() =>
        expect(getHeaderNames()).toEqual(["second_column", "first_column"]),
      );
      await waitFor(() =>
        expect(getColumnWidth("second_column")).toBe(measuredWidth),
      );
      expect(getColumnWidth("first_column")).toBe(resizedWidth);
    });
  });

  describe("changing the query (metabase#56771)", () => {
    const ID = createMockNumericColumn({
      name: "ID",
      display_name: "ID",
    });
    const TOTAL = createMockNumericColumn({
      name: "TOTAL",
      display_name: "Total",
    });
    const CATEGORY = createMockCategoryColumn({
      name: "CATEGORY",
      display_name: "Products → Category",
    });

    it("should size a new column from its content when another column has a stored width", async () => {
      const { getSettings, rerenderWith } = setup({
        cols: [ID, TOTAL],
        rows: [
          [1, 39.72],
          [2, 117.03],
        ],
      });
      await waitFor(() =>
        expect(getColumnWidth("Total")).toBe(getTextWidth("117.03") + 2),
      );

      resizeColumn("ID", 100);
      await waitFor(() =>
        expect(getSettings()["table.column_widths"]).toEqual([
          getColumnWidth("ID"),
        ]),
      );
      const idWidth = getColumnWidth("ID");

      rerenderWith(
        [ID, TOTAL, CATEGORY],
        [
          [1, 39.72, "Gizmo"],
          [2, 117.03, "Doohickey"],
        ],
      );

      const categoryWidth = getTextWidth("Products → Category") + 2;
      // wider than the 150px that a column without a width gets
      expect(categoryWidth).toBeGreaterThan(160);
      await waitFor(() =>
        expect(getColumnWidth("Products → Category")).toBe(categoryWidth),
      );
      expect(getColumnWidth("ID")).toBe(idWidth);
      expect(getColumnWidth("Total")).toBe(getTextWidth("117.03") + 2);
    });
  });

  describe("dashcard (metabase#57381)", () => {
    const SIDE_COLUMN_WIDTH = 200;
    const REVIEW_COLUMNS = [
      createMockCategoryColumn({ name: "BODY", display_name: "Body" }),
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At",
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
      }),
      createMockNumericColumn({ name: "ID", display_name: "ID" }),
      createMockNumericColumn({
        name: "PRODUCT_ID",
        display_name: "Product ID",
      }),
      createMockCategoryColumn({ name: "REVIEWER", display_name: "Reviewer" }),
      createMockNumericColumn({ name: "RATING", display_name: "Rating" }),
    ];
    const REVIEW_ROWS: RowValues[] = [
      ["Great product", "2025-01-01T00:00:00Z", 1, 10, "christ", 5],
      ["Not bad", "2025-01-02T00:00:00Z", 2, 11, "cristina", 4],
    ];
    const SETTINGS: VisualizationSettings = {
      // the middle column has no width
      "table.column_widths": [SIDE_COLUMN_WIDTH, null, SIDE_COLUMN_WIDTH],
      "table.columns": [
        { name: "BODY", enabled: true },
        { name: "CREATED_AT", enabled: false },
        { name: "ID", enabled: true },
        { name: "PRODUCT_ID", enabled: false },
        { name: "REVIEWER", enabled: false },
        { name: "RATING", enabled: true },
      ],
    };

    it("should expand the columns to the full width, and keep a manually resized width", async () => {
      setup({
        cols: REVIEW_COLUMNS,
        rows: REVIEW_ROWS,
        settings: SETTINGS,
        isDashboard: true,
      });
      expect(getHeaderNames()).toEqual(["Body", "ID", "Rating"]);
      const idMeasuredWidth = getTextWidth("ID") + 2;

      await waitFor(() =>
        expect(getColumnWidth("Body")).toBeGreaterThan(2 * SIDE_COLUMN_WIDTH),
      );
      const factor = GRID_WIDTH / (2 * SIDE_COLUMN_WIDTH + idMeasuredWidth);
      expect(getColumnWidth("Body")).toBeCloseTo(SIDE_COLUMN_WIDTH * factor);
      expect(getColumnWidth("Rating")).toBeCloseTo(SIDE_COLUMN_WIDTH * factor);
      expect(getColumnWidth("ID")).toBeGreaterThan(2 * idMeasuredWidth);
      const totalWidth = ["Body", "ID", "Rating"]
        .map(getColumnWidth)
        .reduce((sum, width) => sum + width, 0);
      expect(totalWidth).toBeCloseTo(GRID_WIDTH);

      const expandedBodyWidth = getColumnWidth("Body");
      const expandedRatingWidth = getColumnWidth("Rating");
      const expandedIdWidth = getColumnWidth("ID");
      resizeColumn("Body", -100);

      await waitFor(() =>
        expect(getColumnWidth("Body")).toBeCloseTo(expandedBodyWidth - 100),
      );
      expect(getColumnWidth("Rating")).toBeCloseTo(expandedRatingWidth);
      expect(getColumnWidth("ID")).toBeCloseTo(expandedIdWidth);
    });
  });
});
