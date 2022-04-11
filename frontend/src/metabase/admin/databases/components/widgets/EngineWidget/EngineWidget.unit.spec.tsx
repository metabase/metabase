import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import EngineWidget from "./EngineWidget";
import { EngineField, EngineOption } from "./types";

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
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.getByText("Presto")).toBeInTheDocument();

    userEvent.click(screen.getByText("Show fewer options"));
    expect(screen.getByText("MySQL")).toBeInTheDocument();
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.queryByText("Presto")).not.toBeInTheDocument();
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

  it("should display a self-hosted empty state when no database found", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);
    userEvent.type(screen.getByRole("textbox"), "not found");

    expect(screen.getByText(/Don’t see your database/)).toBeInTheDocument();
    expect(screen.getByText(/Community Drivers/)).toBeInTheDocument();
  });

  it("should display a cloud empty state when no database found", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} isHosted={true} />);
    userEvent.type(screen.getByRole("textbox"), "not found");

    expect(screen.getByText(/Didn’t find anything/)).toBeInTheDocument();
  });

  it("should allow selection via keyboard", () => {
    const field = getField();
    const options = getOptions();

    render(<EngineWidget field={field} options={options} />);

    const input = screen.getByRole("textbox");
    userEvent.type(input, "sql");
    userEvent.type(input, specialChars.arrowDown);
    userEvent.type(input, specialChars.arrowDown);
    userEvent.type(input, specialChars.enter);

    expect(field.onChange).toHaveBeenCalledWith("postgres");
  });
});

const getField = (value?: string): EngineField => ({
  value,
  onChange: jest.fn(),
});

const getOptions = (): EngineOption[] => [
  {
    name: "MySQL",
    value: "mysql",
    index: 1,
  },
  {
    name: "PostgreSQL",
    value: "postgres",
    index: 2,
  },
  {
    name: "SQL Server",
    value: "sqlserver",
    index: 3,
  },
  {
    name: "Amazon Redshift",
    value: "redshift",
    index: 4,
  },
  {
    name: "Snowflake",
    value: "snowflake",
    index: 5,
  },
  {
    name: "H2",
    value: "h2",
    index: -1,
  },
  {
    name: "Presto",
    value: "presto-jdbc",
    index: -1,
  },
];
