import { type MouseEvent, useMemo } from "react";

import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import {
  type ColumnOptions,
  type RowIdColumnOptions,
  useDataGridInstance,
} from "metabase/data-grid";

import { DataGrid } from "./DataGrid";

const sampleData = [
  { id: 1, name: "Item 1", category: "Electronics", price: 99.9 },
  { id: 2, name: "Item 2", category: "Clothing", price: 45.5 },
  { id: 3, name: "Item 3", category: "Books", price: 15.0 },
  { id: 4, name: "Item 4", category: "Food", price: 8.7 },
  { id: 5, name: "Item 5", category: "Electronics", price: 199.9 },
];

const DEFAULT_COLUMN_SIZING = {
  id: 100,
  name: 150,
  category: 120,
  price: 120,
};

const DEFAULT_COLUMN_ORDER = ["id", "name", "category", "price"];

type SampleDataType = (typeof sampleData)[0];

interface TestDataGridProps {
  onHeaderCellClick?: (
    event: MouseEvent<HTMLDivElement>,
    columnId?: string,
  ) => void;
  onBodyCellClick?: (
    event: MouseEvent<HTMLDivElement>,
    rowIndex: number,
    columnId: string,
  ) => void;
  onAddColumnClick?: () => void;
  onColumnResize?: (columnName: string, width: number) => void;
  onColumnReorder?: (columnIds: string[]) => void;
  initialColumnSizing?: Record<string, number>;
  initialColumnOrder?: string[];
  enableRowId?: boolean;
  sortableColumns?: boolean;
  wrapableColumns?: string[];
  enableSelection?: boolean;
  striped?: boolean;
  pinnedTopRowsCount?: number;
  pinnedLeftColumnsCount?: number;
}

const TestDataGrid = ({
  onHeaderCellClick,
  onBodyCellClick,
  onAddColumnClick,
  onColumnResize,
  onColumnReorder,
  initialColumnSizing = DEFAULT_COLUMN_SIZING,
  initialColumnOrder = DEFAULT_COLUMN_ORDER,
  enableRowId = false,
  sortableColumns = false,
  wrapableColumns = [],
  enableSelection = false,
  striped = false,
  pinnedTopRowsCount,
  pinnedLeftColumnsCount,
}: TestDataGridProps) => {
  const columns: ColumnOptions<SampleDataType>[] = useMemo(
    () => [
      {
        id: "id",
        name: "ID",
        accessorFn: (row) => row.id,
        align: "right",
        cellVariant: "pill",
        sortDirection: sortableColumns ? "desc" : undefined,
      },
      {
        id: "name",
        name: "Name",
        accessorFn: (row) => row.name,
        sortDirection: sortableColumns ? "asc" : undefined,
        wrap: wrapableColumns.includes("name"),
      },
      {
        id: "category",
        name: "Category",
        accessorFn: (row) => row.category,
        wrap: wrapableColumns.includes("category"),
        getBackgroundColor: (value) => {
          switch (value) {
            case "Electronics":
              return "rgb(230, 247, 255)";
            case "Clothing":
              return "rgb(246, 255, 237)";
            case "Books":
              return "rgb(255, 247, 230)";
            case "Food":
              return "rgb(255, 241, 240)";
            default:
              return "";
          }
        },
      },
      {
        id: "price",
        name: "Price",
        accessorFn: (row) => row.price,
        formatter: (value) => `$${value}`,
        align: "right",
        wrap: wrapableColumns.includes("price"),
      },
    ],
    [sortableColumns, wrapableColumns],
  );

  const rowId = useMemo<RowIdColumnOptions | undefined>(
    () =>
      enableRowId
        ? {
            variant: "indexExpand",
            expandedIndex: undefined,
          }
        : undefined,
    [enableRowId],
  );

  const tableProps = useDataGridInstance({
    data: sampleData,
    columnsOptions: columns,
    columnOrder: initialColumnOrder,
    columnSizingMap: initialColumnSizing,
    onColumnReorder,
    onColumnResize,
    rowId,
    enableSelection,
    pinnedTopRowsCount,
    pinnedLeftColumnsCount,
  });

  return (
    <DataGrid
      {...tableProps}
      striped={striped}
      onHeaderCellClick={onHeaderCellClick}
      onBodyCellClick={onBodyCellClick}
      onAddColumnClick={onAddColumnClick}
    />
  );
};

describe("DataGrid", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the grid with expected structure", () => {
    renderWithProviders(<TestDataGrid />);
    act(() => {
      jest.runAllTimers();
    });

    expect(screen.getByTestId("table-root")).toBeInTheDocument();
    expect(screen.getByTestId("table-header")).toBeInTheDocument();
    expect(screen.getByTestId("table-body")).toBeInTheDocument();
  });

  it("calls onBodyCellClick when clicking a cell", () => {
    const onBodyCellClick = jest.fn();
    renderWithProviders(<TestDataGrid onBodyCellClick={onBodyCellClick} />);
    act(() => {
      jest.runAllTimers();
    });

    const bodyCells = screen
      .getByTestId("table-body")
      .querySelectorAll('[role="gridcell"]');

    fireEvent.click(bodyCells[0]);
    expect(onBodyCellClick).toHaveBeenCalledTimes(1);
    expect(onBodyCellClick).toHaveBeenCalledWith(
      expect.anything(), // event
      0, // row index
      "id", // column ID
    );
  });

  it("displays formatted values using formatters", () => {
    renderWithProviders(<TestDataGrid />);
    act(() => {
      jest.runAllTimers();
    });

    const visibleCells = screen.getAllByTestId("cell-data");
    const priceCell = Array.from(visibleCells).find((cell) =>
      cell.textContent?.startsWith("$"),
    );

    expect(priceCell?.textContent).toBe("$99.9");
  });

  it("calls onAddColumnClick when clicking add column button", () => {
    const onAddColumnClick = jest.fn();
    renderWithProviders(<TestDataGrid onAddColumnClick={onAddColumnClick} />);
    act(() => {
      jest.runAllTimers();
    });

    const addButton = screen.getByRole("button", { name: /add/i });
    fireEvent.click(addButton);
    expect(onAddColumnClick).toHaveBeenCalledTimes(1);
  });

  it("renders row ID column when enabled", () => {
    renderWithProviders(<TestDataGrid enableRowId={true} />);
    act(() => {
      jest.runAllTimers();
    });

    const body = screen.getByTestId("table-body");
    const rowIdCells = body.querySelectorAll('[data-testid="row-id-cell"]');

    expect(rowIdCells).toHaveLength(sampleData.length);

    rowIdCells.forEach((cell, index) => {
      expect(cell).toHaveTextContent(String(index + 1));
    });
  });

  it("displays proper sort indicators for sortable columns", () => {
    renderWithProviders(<TestDataGrid sortableColumns={true} />);
    act(() => {
      jest.runAllTimers();
    });

    const headerCells = screen
      .getByTestId("table-header")
      .querySelectorAll('[data-testid="header-cell"]');

    const idHeader = Array.from(headerCells).find((header) =>
      header.textContent?.includes("ID"),
    );
    const nameHeader = Array.from(headerCells).find((header) =>
      header.textContent?.includes("Name"),
    );

    expect(idHeader).toBeDefined();
    expect(nameHeader).toBeDefined();

    const idSortIcon = idHeader!.querySelector('svg[name="chevrondown"]');
    const nameSortIcon = nameHeader!.querySelector('svg[name="chevronup"]');

    expect(idSortIcon).toBeDefined();
    expect(nameSortIcon).toBeDefined();
  });

  it("renders pinned rows in a separate sticky section", () => {
    const pinnedTopRowsCount = 2;
    renderWithProviders(
      <TestDataGrid pinnedTopRowsCount={pinnedTopRowsCount} />,
    );
    act(() => {
      jest.runAllTimers();
    });

    const pinnedPinnedQuadrant = screen.queryByTestId("pinned-pinned-quadrant");
    expect(pinnedPinnedQuadrant).not.toBeInTheDocument();

    const pinnedCenterQuadrant = screen.getByTestId("pinned-center-quadrant");
    const pinnedRows = pinnedCenterQuadrant.querySelectorAll('[role="row"]');
    expect(pinnedRows).toHaveLength(pinnedTopRowsCount);

    const centerCenterQuadrant = screen.getByTestId("center-center-quadrant");
    const centerRows = centerCenterQuadrant.querySelectorAll('[role="row"]');
    expect(centerRows).toHaveLength(sampleData.length - pinnedTopRowsCount);
  });

  it("renders pinned columns in a separate sticky section", () => {
    renderWithProviders(<TestDataGrid pinnedLeftColumnsCount={1} />);
    act(() => {
      jest.runAllTimers();
    });

    const headerPinnedQuadrant = screen.getByTestId("header-pinned-quadrant");
    const pinnedHeaderCells = headerPinnedQuadrant.querySelectorAll(
      '[data-testid="header-cell"]',
    );
    expect(pinnedHeaderCells).toHaveLength(1);
    expect(pinnedHeaderCells[0]).toHaveTextContent("ID");

    const headerCenterQuadrant = screen.getByTestId("header-center-quadrant");
    const centerHeaderCells = headerCenterQuadrant.querySelectorAll(
      '[data-testid="header-cell"]',
    );
    expect(centerHeaderCells).toHaveLength(3);

    const centerPinnedQuadrant = screen.getByTestId("center-pinned-quadrant");
    const pinnedBodyCells =
      centerPinnedQuadrant.querySelectorAll('[role="gridcell"]');
    expect(pinnedBodyCells.length).toBeGreaterThan(0);
  });

  it("renders both pinned rows and pinned columns together", () => {
    renderWithProviders(
      <TestDataGrid pinnedTopRowsCount={1} pinnedLeftColumnsCount={1} />,
    );
    act(() => {
      jest.runAllTimers();
    });

    const pinnedPinnedQuadrant = screen.getByTestId("pinned-pinned-quadrant");
    const pinnedPinnedCells =
      pinnedPinnedQuadrant.querySelectorAll('[role="gridcell"]');
    expect(pinnedPinnedCells).toHaveLength(1);

    const pinnedCenterQuadrant = screen.getByTestId("pinned-center-quadrant");
    const pinnedCenterCells =
      pinnedCenterQuadrant.querySelectorAll('[role="gridcell"]');
    expect(pinnedCenterCells).toHaveLength(3);

    const centerPinnedQuadrant = screen.getByTestId("center-pinned-quadrant");
    const centerPinnedRows =
      centerPinnedQuadrant.querySelectorAll('[role="row"]');
    expect(centerPinnedRows).toHaveLength(sampleData.length - 1);

    const centerCenterQuadrant = screen.getByTestId("center-center-quadrant");
    const centerCenterRows =
      centerCenterQuadrant.querySelectorAll('[role="row"]');
    expect(centerCenterRows).toHaveLength(sampleData.length - 1);
  });

  it("unpins columns that exceed 90% of container width", () => {
    renderWithProviders(<TestDataGrid pinnedLeftColumnsCount={2} />);
    act(() => {
      jest.runAllTimers();
    });

    const headerPinnedQuadrant = screen.getByTestId("header-pinned-quadrant");
    const pinnedHeaderCells = headerPinnedQuadrant.querySelectorAll(
      '[data-testid="header-cell"]',
    );
    expect(pinnedHeaderCells).toHaveLength(1);
    expect(pinnedHeaderCells[0]).toHaveTextContent("ID");
  });

  it("unpins rows that exceed 80% of container height", () => {
    renderWithProviders(<TestDataGrid pinnedTopRowsCount={5} />);
    act(() => {
      jest.runAllTimers();
    });

    const pinnedCenterQuadrant = screen.getByTestId("pinned-center-quadrant");
    const pinnedRows = pinnedCenterQuadrant.querySelectorAll('[role="row"]');
    expect(pinnedRows.length).toBeLessThan(5);
    expect(pinnedRows.length).toBe(3);

    const centerCenterQuadrant = screen.getByTestId("center-center-quadrant");
    const centerRows = centerCenterQuadrant.querySelectorAll('[role="row"]');
    expect(centerRows).toHaveLength(sampleData.length - 3);
  });

  it("renders center section rows when all columns are pinned", () => {
    renderWithProviders(<TestDataGrid pinnedLeftColumnsCount={4} />);
    act(() => {
      jest.runAllTimers();
    });

    const centerCenterQuadrant = screen.getByTestId("center-center-quadrant");
    const centerRows = centerCenterQuadrant.querySelectorAll('[role="row"]');

    expect(centerRows.length).toBeGreaterThan(0);

    centerRows.forEach((row) => {
      expect(row).toHaveAttribute("data-index");
    });
  });

  it("can copy selected cells with headers included", async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithProviders(
      <TestDataGrid sortableColumns={true} enableSelection={true} />,
    );

    act(() => {
      jest.runAllTimers();
    });

    const bodyCells = screen
      .getByTestId("table-body")
      .querySelectorAll("[data-selectable-cell]");

    // Find cells by their content
    const cellsArray = Array.from(bodyCells);
    const firstCell = cellsArray.find((cell) => cell.textContent === "Item 1");
    const lastCell = cellsArray.find((cell) => cell.textContent === "Clothing");

    // Select first cell and extend to last desired cell
    fireEvent.mouseDown(firstCell!);
    fireEvent.mouseUp(firstCell!);
    fireEvent.mouseDown(lastCell!, { shiftKey: true });
    fireEvent.mouseUp(lastCell!);

    // Trigger copy
    fireEvent.keyDown(window, { key: "c", metaKey: true });

    // Assert clipboard was called and data copied
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedText = writeTextMock.mock.calls[0][0];

    const lines = copiedText.split("\n");
    expect(lines.length).toBe(3);

    // Should have headers
    expect(lines[0]).toBe("Name\tCategory");
    // And selected data rows
    expect(lines[1]).toBe("Item 1\tElectronics");
    expect(lines[2]).toBe("Item 2\tClothing");
  });

  it("uses correct ARIA roles for grid structure (#70547)", () => {
    renderWithProviders(<TestDataGrid />);

    const rows = within(screen.getByRole("grid")).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);

    const headerRow = rows[0];
    const bodyRows = rows.slice(1);

    const columnHeaders = within(headerRow).getAllByRole("columnheader");
    expect(columnHeaders.length).toBeGreaterThan(0);

    bodyRows.forEach((row) => {
      const cells = within(row).getAllByRole("gridcell");
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it("applies striped class to alternating rows when enabled", () => {
    renderWithProviders(<TestDataGrid striped={true} />);

    const bodyRows = screen
      .getByTestId("table-body")
      .querySelectorAll('[role="row"]');

    expect(bodyRows[0]).not.toHaveAttribute("data-row-striped", "true");
    expect(bodyRows[1]).toHaveAttribute("data-row-striped", "true");
    expect(bodyRows[2]).not.toHaveAttribute("data-row-striped", "true");
  });

  it("does not apply striped class when disabled", () => {
    renderWithProviders(<TestDataGrid striped={false} />);

    const bodyRows = screen
      .getByTestId("table-body")
      .querySelectorAll('[role="row"]');

    bodyRows.forEach((row) => {
      expect(row).not.toHaveAttribute("data-row-striped", "true");
    });
  });
});
