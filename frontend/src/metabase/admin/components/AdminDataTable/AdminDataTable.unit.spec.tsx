import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { SortingOptions } from "metabase-types/api";

import {
  AdminDataTable,
  type AdminDataTableColumn,
  type AdminDataTableProps,
} from "./AdminDataTable";

type Row = { id: number; name: string; count: number };

type SortColumn = "name" | "count";

const ROWS: Row[] = [
  { id: 1, name: "Alpha", count: 10 },
  { id: 2, name: "Beta", count: 20 },
];

const COLUMNS: AdminDataTableColumn<Row, SortColumn>[] = [
  { key: "name", title: "Name", sortKey: "name", render: (row) => row.name },
  {
    key: "count",
    title: "Count",
    sortKey: "count",
    align: "right",
    render: (row) => row.count,
  },
  // A static, non-sortable column.
  { key: "id", title: "ID", render: (row) => row.id },
];

type SetupOpts = Partial<AdminDataTableProps<Row, SortColumn>> & {
  sortingOptions?: SortingOptions<SortColumn>;
};

const setup = ({ sortingOptions, ...props }: SetupOpts = {}) => {
  const onSortingOptionsChange = jest.fn();
  const onPageChange = jest.fn();
  const onRowClick = jest.fn();

  const utils = render(
    <AdminDataTable<Row, SortColumn>
      columns={COLUMNS}
      rows={ROWS}
      getRowKey={(row) => row.id}
      sorting={{
        sortingOptions: sortingOptions ?? {
          sort_column: "name",
          sort_direction: "asc",
        },
        onSortingOptionsChange,
      }}
      onRowClick={onRowClick}
      {...props}
    />,
  );

  return { ...utils, onSortingOptionsChange, onPageChange, onRowClick };
};

describe("AdminDataTable", () => {
  it("renders headers and cell values from each column's render()", () => {
    setup();

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
    expect(screen.getByText("ID")).toBeInTheDocument();

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("toggles the sort direction when a sortable header is clicked", async () => {
    const { onSortingOptionsChange } = setup({
      sortingOptions: { sort_column: "name", sort_direction: "asc" },
    });

    await userEvent.click(screen.getByText("Name"));

    expect(onSortingOptionsChange).toHaveBeenCalledWith({
      sort_column: "name",
      sort_direction: "desc",
    });
  });

  it("does not wire sorting on columns without a sortKey", async () => {
    const { onSortingOptionsChange } = setup();

    await userEvent.click(screen.getByText("ID"));

    expect(onSortingOptionsChange).not.toHaveBeenCalled();
  });

  it("renders sortable headers as buttons and non-sortable ones as plain headers", () => {
    setup({
      // "Sortable" has a sortKey; "Static" doesn't. (Sort on an unrelated column so
      // "Sortable" isn't the active one — an active header also renders a sort icon.)
      sortingOptions: { sort_column: "name", sort_direction: "asc" },
      columns: [
        {
          key: "sortable",
          title: "Sortable",
          sortKey: "count",
          render: () => "x",
        },
        { key: "static", title: "Static", render: () => "y" },
      ],
    });

    // the column with a sortKey exposes an interactive control...
    expect(
      screen.getByRole("button", { name: "Sortable" }),
    ).toBeInTheDocument();
    // ...while the column without one stays a static header, not a button.
    expect(
      screen.getByRole("columnheader", { name: "Static" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Static" }),
    ).not.toBeInTheDocument();
  });

  it("fires onRowClick with the clicked row", async () => {
    const { onRowClick } = setup();

    await userEvent.click(screen.getByText("Beta"));

    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });

  it("shows the empty message when there are no rows", () => {
    setup({ rows: [], emptyText: "Nothing here" });

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("keeps showing rows while refetching (overlay instead of blanking)", () => {
    setup({ loading: true });

    // rows stay visible; the spinner overlays them
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("does not render rows while loading with no data yet", () => {
    setup({ rows: [], loading: true, emptyText: "Nothing here" });

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing here")).not.toBeInTheDocument();
  });

  it("renders the error message when an error is present", () => {
    setup({ rows: [], error: "Boom" });

    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("caps the body height when maxBodyHeight is set", () => {
    setup({ maxBodyHeight: "calc(100vh - 23rem)" });

    expect(screen.getByTestId("admin-data-table-body")).toHaveStyle({
      maxHeight: "calc(100vh - 23rem)",
    });
  });

  it("hides the total by default and shows it when showTotal is set", () => {
    const onPageChange = jest.fn();

    const { rerender } = setup({
      pagination: { page: 1, pageSize: 2, total: 10, onPageChange },
    });
    expect(screen.queryByTestId("pagination-total")).not.toBeInTheDocument();

    rerender(
      <AdminDataTable<Row, SortColumn>
        columns={COLUMNS}
        rows={ROWS}
        pagination={{
          page: 1,
          pageSize: 2,
          total: 10,
          onPageChange,
          showTotal: true,
        }}
      />,
    );
    expect(screen.getByTestId("pagination-total")).toHaveTextContent("10");
  });

  it("renders pagination controls and pages forward/back", async () => {
    const onPageChange = jest.fn();
    setup({
      pagination: { page: 1, pageSize: 2, total: 10, onPageChange },
    });

    await userEvent.click(screen.getByTestId("next-page-btn"));
    expect(onPageChange).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByTestId("previous-page-btn"));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });
});
