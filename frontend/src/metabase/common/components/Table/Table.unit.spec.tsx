import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon } from "__support__/ui";

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

describe("common > components > Table", () => {
  it("should render table headings", () => {
    render(
      <Table
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
      <Table
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
      <Table
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
    expect(getIcon("chevrondown")).toBeInTheDocument();
    firstRowShouldHaveText("Bulbasaur");

    await userEvent.click(sortButton);
    expect(getIcon("chevronup")).toBeInTheDocument();
    firstRowShouldHaveText("Squirtle");
  });

  it("should sort on multiple columns", async () => {
    render(
      <Table
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
    expect(getIcon("chevrondown")).toBeInTheDocument();
    firstRowShouldHaveText("Bulbasaur");

    await userEvent.click(sortGenButton);
    expect(getIcon("chevrondown")).toBeInTheDocument();
    firstRowShouldHaveText("1");

    await userEvent.click(sortGenButton);
    expect(getIcon("chevronup")).toBeInTheDocument();
    firstRowShouldHaveText("8");
  });
});

function firstRowShouldHaveText(text: string) {
  expect(screen.getAllByRole("row")[1]).toHaveTextContent(text);
}
