import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EngineWidget from "./EngineWidget";

describe("EngineWidget", () => {
  it("should allow choosing a database", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);
    userEvent.click(screen.getByText("PostgreSQL"));

    expect(field.onChange).toHaveBeenCalledWith("postgres");
  });

  it("should allow clearing selection", () => {
    const field = getField("postgres");
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);
    userEvent.click(screen.getByLabelText("Remove database"));

    expect(field.onChange).toHaveBeenCalledWith(undefined);
  });

  it("should toggle between displaying elevated and all databases", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);

    userEvent.click(screen.getByText("Show more options"));
    expect(screen.getByText("MySQL")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("SQL Server")).toBeInTheDocument();

    userEvent.click(screen.getByText("Show less options"));
    expect(screen.getByText("MySQL")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.queryByText("SQL Server")).not.toBeInTheDocument();
  });

  it("should allow searching for a database", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);
    userEvent.type(screen.getByRole("textbox"), "server");

    expect(screen.getByText("SQL Server")).toBeInTheDocument();
    expect(screen.queryByText("MySQL")).not.toBeInTheDocument();
    expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument();
    expect(screen.queryByText("Show more options")).not.toBeInTheDocument();
  });

  it("should display an empty state when no database found", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);
    userEvent.type(screen.getByRole("textbox"), "not found");

    expect(screen.getByText(/Don’t see your database/)).toBeInTheDocument();
  });
});

const getField = value => ({
  value,
  onChange: jest.fn(),
});

const getOptions = () => [
  {
    name: "MySQL",
    value: "mysql",
    index: 1,
    official: true,
  },
  {
    name: "SQL Server",
    value: "sqlserver",
    index: -1,
    official: true,
  },
  {
    name: "PostgreSQL",
    value: "postgres",
    index: 0,
    official: false,
  },
];
