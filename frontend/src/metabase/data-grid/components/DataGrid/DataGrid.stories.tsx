import type { Meta, StoryFn } from "@storybook/react";
import { useCallback, useMemo, useState } from "react";

import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type {
  ColumnOptions,
  RowIdColumnOptions,
} from "metabase/data-grid/types";

import { DataGrid } from "./DataGrid";

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
    Story => (
      <div style={{ height: "calc(100vh - 2rem)", overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
} as Meta<typeof DataGrid>;

type Story = StoryFn<typeof DataGrid>;

const sampleData = Array.from({ length: 2000 }, (_, rowIndex) => {
  return {
    id: rowIndex + 1,
    name: `Item ${rowIndex + 1}`,
    category: ["Electronics", "Clothing", "Books", "Food"][rowIndex % 4],
    price: Math.round(Math.random() * 1000) / 10,
    quantity: Math.round(Math.random() * 100),
    description: `This is a sample description for item ${rowIndex + 1}. ${"It can be longer to demonstrate text wrapping. ".repeat(
      Math.floor(Math.random() * 18) + 1,
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
        accessorFn: row => row.id,
      },
      {
        id: "name",
        name: "Name",
        accessorFn: row => row.name,
      },
      {
        id: "category",
        name: "Category",
        accessorFn: row => row.category,
      },
      {
        id: "price",
        name: "Price",
        accessorFn: row => row.price,
        formatter: value => `$${value}`,
        align: "right",
      },
      {
        id: "quantity",
        name: "Quantity",
        accessorFn: row => row.quantity,
        align: "right",
      },
      {
        id: "description",
        name: "Description",
        accessorFn: row => row.description,
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
        accessorFn: row => row.id,
        align: "right",
        cellVariant: "pill",
        sortDirection: "desc",
      },
      {
        id: "name",
        name: "Name",
        sortDirection: "asc",
        accessorFn: row => row.name,
      },
      {
        id: "category",
        name: "Category",
        align: "middle",
        accessorFn: row => row.category,
        getBackgroundColor: value =>
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
        accessorFn: row => `$${row.price.toFixed(2)}`,
        align: "right",
      },
      {
        id: "quantity",
        name: "Quantity",
        accessorFn: row => row.quantity,
        align: "right",
      },
      {
        id: "description",
        name: "Description",
        accessorFn: row => row.description,
        wrap: true,
      },
    ],
    [],
  );

  const rowId: RowIdColumnOptions = useMemo(
    () => ({
      variant: "indexExpand",
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
    onColumnResize: setColumnSizing,
    rowId,
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
