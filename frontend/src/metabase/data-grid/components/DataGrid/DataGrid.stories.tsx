import type { Meta, StoryFn } from "@storybook/react-webpack5";
import { useCallback, useMemo, useState } from "react";

import { getStore } from "__support__/entities-store";
import { BaseCell } from "metabase/data-grid";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type {
  ColumnOptions,
  RowIdColumnOptions,
} from "metabase/data-grid/types";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { publicReducers } from "metabase/reducers-public";
import { Checkbox, Flex } from "metabase/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DataGrid } from "./DataGrid";
import classes from "./DataGrid.module.css";

export default {
  title: "DataGrid/DataGrid",
  component: DataGrid,
  parameters: {
    docs: {
      description: {
        component:
          "A virtualized table component with support for column reordering, resizing, and sorting",
      },
    },
  },
  decorators: [
    (Story) => (
      <MetabaseReduxProvider store={store}>
        <div style={{ height: "calc(100vh - 2rem)", overflow: "hidden" }}>
          <Story />
        </div>
      </MetabaseReduxProvider>
    ),
  ],
} as Meta<typeof DataGrid>;

type Story = StoryFn<typeof DataGrid>;

const initialState = createMockState({
  settings: createMockSettingsState(),
});
const store = getStore(publicReducers, initialState, []);

const sampleData = Array.from({ length: 2000 }, (_, rowIndex) => {
  return {
    id: rowIndex + 1,
    name: `Item ${rowIndex + 1}`,
    category: ["Electronics", "Clothing", "Books", "Food"][rowIndex % 4],
    price: (rowIndex % 10) + 100,
    quantity: (rowIndex % 10) + 5,
    description: `This is a sample description for item ${rowIndex + 1}. ${"It can be longer to demonstrate text wrapping. ".repeat(
      1 + (rowIndex % 17),
    )}`,
  };
});

type SampleDataType = (typeof sampleData)[0];

export const BasicGrid: Story = () => {
  const columns: ColumnOptions<SampleDataType>[] = useMemo(
    () => [
      {
        id: "id",
        name: "ID",
        accessorFn: (row) => row.id,
      },
      {
        id: "name",
        name: "Name",
        accessorFn: (row) => row.name,
      },
      {
        id: "category",
        name: "Category",
        accessorFn: (row) => row.category,
      },
      {
        id: "price",
        name: "Price",
        accessorFn: (row) => row.price,
        formatter: (value) => `$${value}`,
        align: "right",
      },
      {
        id: "quantity",
        name: "Quantity",
        accessorFn: (row) => row.quantity,
        align: "right",
      },
      {
        id: "description",
        name: "Description",
        accessorFn: (row) => row.description,
      },
    ],
    [],
  );

  const tableProps = useDataGridInstance({
    data: sampleData,
    columnsOptions: columns,
  });

  return <DataGrid {...tableProps} />;
};

export const CustomStylesGrid: Story = () => {
  const getHeaderTemplate = (name: string) => {
    return function Header() {
      return (
        <strong style={{ padding: "0px 12px", fontWeight: "bold" }}>
          {name}
        </strong>
      );
    };
  };

  const columns: ColumnOptions<SampleDataType>[] = useMemo(
    () => [
      {
        id: "id",
        name: "ID",
        accessorFn: (row) => row.id,
        header: getHeaderTemplate("ID"),
      },
      {
        id: "name",
        name: "Name",
        accessorFn: (row) => row.name,
        header: getHeaderTemplate("Name"),
      },
      {
        id: "category",
        name: "Category",
        accessorFn: (row) => row.category,
        header: getHeaderTemplate("Category"),
      },
    ],
    [],
  );

  const tableProps = useDataGridInstance({
    data: sampleData,
    columnsOptions: columns,
  });

  return (
    <DataGrid
      {...tableProps}
      classNames={{ bodyCell: classes.__storybookStylesApiBodyCellExample }}
      styles={{
        root: { border: "1px solid #000" },
        headerCell: {
          backgroundColor: "#FAFAFB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "auto",
        },
        tableGrid: { gridTemplateRows: "none" },
        row: { height: "auto" },
        headerContainer: { borderBottom: "2px solid #000", height: "auto" },
      }}
    />
  );
};

export const CombinedFeatures: Story = () => {
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "id",
    "name",
    "category",
    "price",
    "quantity",
    "description",
  ]);

  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({
    id: 120,
    name: 150,
    category: 120,
    price: 150,
    quantity: 200,
    description: 600,
  });

  const columns: ColumnOptions<SampleDataType>[] = useMemo(
    () => [
      {
        id: "id",
        name: "ID",
        accessorFn: (row) => row.id,
        align: "right",
        cellVariant: "pill",
        sortDirection: "desc",
      },
      {
        id: "name",
        name: "Name",
        sortDirection: "asc",
        accessorFn: (row) => row.name,
      },
      {
        id: "category",
        name: "Category",
        align: "middle",
        accessorFn: (row) => row.category,
        getBackgroundColor: (value) =>
          value === "Electronics"
            ? "#e6f7ff"
            : value === "Clothing"
              ? "#f6ffed"
              : value === "Books"
                ? "#fff7e6"
                : "#fff1f0",
      },
      {
        id: "price",
        name: "Price",
        accessorFn: (row) => `$${row.price.toFixed(2)}`,
        align: "right",
      },
      {
        id: "quantity",
        name: "Quantity",
        accessorFn: (row) => row.quantity,
        align: "right",
      },
      {
        id: "description",
        name: "Description",
        accessorFn: (row) => row.description,
        wrap: true,
      },
    ],
    [],
  );

  const rowId: RowIdColumnOptions = useMemo(
    () => ({
      variant: "indexExpand",
      expandedIndex: undefined,
      getBackgroundColor: (rowIndex: number) =>
        rowIndex % 2 === 0 ? "#f0f0f0" : "transparent",
    }),
    [],
  );
  const tableProps = useDataGridInstance({
    data: sampleData,
    columnsOptions: columns,
    columnOrder,
    columnSizingMap: columnSizing,
    onColumnReorder: setColumnOrder,
    onColumnResize: (columnName, width) =>
      setColumnSizing((prev) => ({ ...prev, [columnName]: width })),
    rowId,
    enableSelection: true,
  });

  const handleAddColumnClick = useCallback(() => {
    alert("Add column button clicked");
  }, []);

  const handleBodyCellClick = useCallback(
    (
      _: React.MouseEvent<HTMLDivElement>,
      rowIndex: number,
      columnId: string,
    ) => {
      // eslint-disable-next-line no-console
      console.log(`Clicked cell at row ${rowIndex}, column ${columnId}`);
    },
    [],
  );

  const handleHeaderCellClick = useCallback(
    (_: React.MouseEvent<HTMLDivElement>, columnId?: string) => {
      if (columnId) {
        // eslint-disable-next-line no-console
        console.log(`Clicked header for column ${columnId}`);
      }
    },
    [],
  );

  return (
    <DataGrid
      {...tableProps}
      onBodyCellClick={handleBodyCellClick}
      onHeaderCellClick={handleHeaderCellClick}
      onAddColumnClick={handleAddColumnClick}
    />
  );
};

export const SelectableRows: Story = () => {
  const [rowSelection, setRowSelection] = useState<Record<number, boolean>>({});

  const columns: ColumnOptions<SampleDataType>[] = useMemo(
    () => [
      {
        id: "id",
        name: "ID",
        accessorFn: (row) => row.id,
      },
      {
        id: "name",
        name: "Name",
        accessorFn: (row) => row.name,
      },
      {
        id: "category",
        name: "Category",
        accessorFn: (row) => row.category,
      },
      {
        id: "price",
        name: "Price",
        accessorFn: (row) => row.price,
        formatter: (value) => `$${value}`,
        align: "right",
      },
      {
        id: "quantity",
        name: "Quantity",
        accessorFn: (row) => row.quantity,
        align: "right",
      },
      {
        id: "description",
        name: "Description",
        accessorFn: (row) => row.description,
      },
    ],
    [],
  );

  const tableProps = useDataGridInstance({
    data: sampleData,
    columnsOptions: columns,
    columnPinning: { left: ["row_selection"] },
    enableRowSelection: true,
    rowSelection,
    onRowSelectionChange: setRowSelection,
    columnRowSelectOptions: {
      id: "row_selection",
      name: "Row Selection",
      accessorFn: (row) => row.id,
      header: ({ table }) => (
        <Flex h="100%" align="center" justify="center">
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            variant="stacked"
          />
        </Flex>
      ),
      cell: ({ row }) => (
        <BaseCell>
          <Flex h="100%" w="100%" align="center" justify="center">
            <Checkbox
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              indeterminate={row.getIsSomeSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          </Flex>
        </BaseCell>
      ),
    },
  });

  return <DataGrid {...tableProps} />;
};
