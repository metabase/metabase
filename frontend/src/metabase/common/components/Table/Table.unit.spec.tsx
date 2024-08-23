import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon } from "__support__/ui";

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

/** The Japanese words for blue and green are sorted differently in the ja-JP locale vs. the en-US locale */
const sampleJapaneseData: Pokemon[] = [
  {
    id: 1,
    name: "青いゼニガメ (Blue Squirtle)",
    type: "Water",
    generation: 1,
  },
  {
    id: 2,
    name: "緑のフシギダネ (Green Bulbasaur)",
    type: "Grass",
    generation: 1,
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

  it("should respect locales when sorting tables", async () => {
    render(
      <>
        <ClientSortableTable
          data-testid="japanese-table"
          columns={sampleColumns}
          rows={sampleJapaneseData}
          rowRenderer={renderRow}
          locale="ja-JP"
        />
        <ClientSortableTable
          data-testid="english-table"
          columns={sampleColumns}
          rows={sampleJapaneseData}
          rowRenderer={renderRow}
          locale="en-US"
        />
      </>,
    );

    expect(queryIcon("chevrondown")).not.toBeInTheDocument();
    expect(queryIcon("chevronup")).not.toBeInTheDocument();

    const japaneseTable = await screen.findByTestId("japanese-table");
    const englishTable = await screen.findByTestId("english-table");

    // Sort both tables
    await userEvent.click(await within(japaneseTable).findByText("Name"));
    await userEvent.click(await within(englishTable).findByText("Name"));

    // The locales affect the order of the rows:
    const englishRows = within(englishTable).getAllByRole("row");
    expect(englishRows[1]).toHaveTextContent("Green");
    expect(englishRows[2]).toHaveTextContent("Blue");

    const japaneseRows = within(japaneseTable).getAllByRole("row");
    expect(japaneseRows[1]).toHaveTextContent("Blue");
    expect(japaneseRows[2]).toHaveTextContent("Green");
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

  it("should allow you provide a format values when sorting", async () => {
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

  it("if pageination props are passed, it should render the pagination controller.", async () => {
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
