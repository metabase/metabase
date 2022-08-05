import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { ORDERS } from "__support__/sample_database_fixture";
import ExcludeDatePicker from "./ExcludeDatePicker";

const query = ORDERS.query();

const filter = new Filter(
  [null, ["field", ORDERS.CREATED_AT.id, null]],
  null,
  query,
);

describe("ExcludeDatePicker", () => {
  it("is empty option should exclude empty values by applying not-null filter", () => {
    const commitMock = jest.fn();
    render(
      <ExcludeDatePicker
        onFilterChange={jest.fn()}
        onCommit={commitMock}
        filter={filter}
      />,
    );

    fireEvent.click(screen.getByText("Is empty"));

    expect(commitMock).toHaveBeenCalledWith([
      "not-null",
      ["field", ORDERS.CREATED_AT.id, null],
    ]);
  });

  it("is not empty option should exclude non-empty values by applying is-null filter", () => {
    const commitMock = jest.fn();
    render(
      <ExcludeDatePicker
        onFilterChange={jest.fn()}
        onCommit={commitMock}
        filter={filter}
      />,
    );

    fireEvent.click(screen.getByText("Is not empty"));

    expect(commitMock).toHaveBeenCalledWith([
      "is-null",
      ["field", ORDERS.CREATED_AT.id, null],
    ]);
  });
});
