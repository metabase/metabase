import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, render, screen } from "__support__/ui";

import { ClientSortableTable } from "./ClientSortableTable";
import { Table } from "./Table";

type Pokemon = {
  id: number;
  name: string;
  type: string;
  generation: number;
};

const sampleData: Pokemon[] = [
  {
    id: 2,
    name: "Charmander",
    type: "Fire",
    generation: 1,
  },
  {
    id: 1,
    name: "Bulbasaur",
    type: "Grass",
    generation: 1,
  },
  {
    id: 3,
    name: "Squirtle",
    type: "Water",
    generation: 1,
  },
  {
    id: 4,
    name: "Pikachu",
    type: "Electric",
    generation: 1,
  },
  {
    id: 99,
    name: "Scorbunny",
    type: "Fire",
    generation: 8,
  },
];

const sampleColumns = [
  {
    key: "name",
    name: "Name",
  },
  {
    key: "type",
    name: "Type",
  },
  {
    key: "generation",
    name: "Generation",
  },
];

const renderRow = (row: Pokemon) => {
  return (
    <tr>
      <td>{row.name}</td>
      <td>{row.type}</td>
      <td>{row.generation}</td>
    </tr>
  );
};

describe("common > components > ClientSortableTable", () => {
  it("should render table headings", () => {
    render(
      <ClientSortableTable
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();
    expect(screen.queryByText("id")).not.toBeInTheDocument();
  });

  it("should render table row data", () => {
    render(
      <ClientSortableTable
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
      />,
    );
    expect(screen.getByText("Bulbasaur")).toBeInTheDocument();
    expect(screen.getByText("Charmander")).toBeInTheDocument();
    expect(screen.getByText("Scorbunny")).toBeInTheDocument();
    expect(screen.getByText("Grass")).toBeInTheDocument();
    expect(screen.getByText("Water")).toBeInTheDocument();

    expect(screen.queryByText("Sizzlepede")).not.toBeInTheDocument();
  });

  it("should sort the table", async () => {
    render(
      <ClientSortableTable
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
      />,
    );
    const sortButton = screen.getByText("Name");

    expect(queryIcon("chevrondown")).not.toBeInTheDocument();
    expect(queryIcon("chevronup")).not.toBeInTheDocument();
    firstRowShouldHaveText("Charmander");

    await userEvent.click(sortButton);
    expect(getIcon("chevronup")).toBeInTheDocument();
    firstRowShouldHaveText("Bulbasaur");

    await userEvent.click(sortButton);
    expect(getIcon("chevrondown")).toBeInTheDocument();
    firstRowShouldHaveText("Squirtle");
  });

  it("should sort on multiple columns", async () => {
    render(
      <ClientSortableTable
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
      />,
    );
    const sortNameButton = screen.getByText("Name");
    const sortGenButton = screen.getByText("Generation");

    expect(queryIcon("chevrondown")).not.toBeInTheDocument();
    expect(queryIcon("chevronup")).not.toBeInTheDocument();
    firstRowShouldHaveText("Charmander");

    await userEvent.click(sortNameButton);
    expect(getIcon("chevronup")).toBeInTheDocument();
    firstRowShouldHaveText("Bulbasaur");

    await userEvent.click(sortGenButton);
    expect(getIcon("chevronup")).toBeInTheDocument();
    firstRowShouldHaveText("1");

    await userEvent.click(sortGenButton);
    expect(getIcon("chevrondown")).toBeInTheDocument();
    firstRowShouldHaveText("8");
  });

  it("should present the empty component if no rows are given", async () => {
    render(
      <ClientSortableTable
        columns={sampleColumns}
        rows={[]}
        rowRenderer={renderRow}
        emptyBody={
          <tr>
            <td colSpan={3}>No Results</td>
          </tr>
        }
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();
    expect(screen.getByText("No Results")).toBeInTheDocument();
  });

  it("should let you provide format values when sorting", async () => {
    render(
      <ClientSortableTable
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
        formatValueForSorting={(row, colName) => {
          if (colName === "type") {
            if (row.type === "Water") {
              return 10;
            }
            return 1;
          }
          return row[colName as keyof Pokemon];
        }}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();

    const sortNameButton = screen.getByText("Type");
    // Ascending
    await userEvent.click(sortNameButton);
    // Descending
    await userEvent.click(sortNameButton);
    firstRowShouldHaveText("Squirtle");
  });
});

describe("common > components > Table", () => {
  it("should call the onSort handler with values when a row is clicked", async () => {
    const onSort = jest.fn();

    render(
      <Table
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
        onSort={onSort}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Type"));

    expect(onSort).toHaveBeenCalledWith("type", "asc");
  });

  it("should render the pagination controller if pagination props are passed", async () => {
    const onPageChange = jest.fn();

    render(
      <Table
        columns={sampleColumns}
        rows={sampleData}
        rowRenderer={renderRow}
        paginationProps={{
          onPageChange,
          page: 0,
          total: sampleData.length,
          pageSize: 3,
        }}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();

    expect(
      screen.getByRole("navigation", { name: /pagination/ }),
    ).toBeInTheDocument();
  });
});

function firstRowShouldHaveText(text: string) {
  expect(screen.getAllByRole("row")[1]).toHaveTextContent(text);
}
