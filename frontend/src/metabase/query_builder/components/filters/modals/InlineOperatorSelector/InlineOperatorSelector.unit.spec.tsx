import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InlineOperatorSelector } from "./InlineOperatorSelector";

const operatorOptions = [
  {
    validArgumentsFilters: [null],
    multi: true,
    name: "=",
    verboseName: "Equal to",
    moreVerboseName: "is equal to",
    fields: [
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [null],
    multi: true,
    name: "!=",
    verboseName: "Not equal to",
    moreVerboseName: "is not equal to",
    fields: [
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [null],
    name: ">",
    verboseName: "Greater than",
    moreVerboseName: "is greater than",
    fields: [
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [null],
    name: "<",
    verboseName: "Less than",
    moreVerboseName: "is less than",
    fields: [
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [null, null],
    name: "between",
    verboseName: "Between",
    moreVerboseName: "between",
    fields: [
      {
        type: "number",
      },
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [null],
    name: ">=",
    verboseName: "Greater than or equal to",
    moreVerboseName: "is greater than or equal to",
    fields: [
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [null],
    name: "<=",
    verboseName: "Less than or equal to",
    moreVerboseName: "is less than or equal to",
    fields: [
      {
        type: "number",
      },
    ],
  },
  {
    validArgumentsFilters: [],
    name: "is-null",
    verboseName: "Is empty",
    moreVerboseName: "is empty",
    fields: [],
  },
  {
    validArgumentsFilters: [],
    name: "not-null",
    verboseName: "Not empty",
    moreVerboseName: "is not empty",
    fields: [],
  },
];

describe("InlineOperatorSelector", () => {
  it("displays a field name", () => {
    render(<InlineOperatorSelector fieldName="field nombre" />);

    expect(screen.getByText("field nombre")).toBeInTheDocument();
  });

  it("does not display a dropdown arrow if no onChange function is provided", () => {
    render(
      <InlineOperatorSelector
        fieldName="field nombre"
        operators={operatorOptions}
        value="="
      />,
    );

    expect(screen.queryByLabelText("chevrondown icon")).not.toBeInTheDocument();
  });

  it("displays a dropdown arrow if options and an onChange function are provided", () => {
    render(
      <InlineOperatorSelector
        fieldName="field nombre"
        operators={operatorOptions}
        value="="
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
  });

  it("displays the selected value", () => {
    render(
      <InlineOperatorSelector
        fieldName="field nombre"
        operators={operatorOptions}
        value="="
      />,
    );

    expect(screen.getByText("Equal to")).toBeInTheDocument();
  });

  it("displays dropdown options for all provided options", async () => {
    render(
      <InlineOperatorSelector
        fieldName="field nombre"
        operators={operatorOptions}
        value="="
        onChange={jest.fn()}
      />,
    );

    userEvent.click(screen.getByText("Equal to"));
    await screen.findByTestId("operator-options");

    operatorOptions.forEach(option => {
      expect(screen.getAllByText(option.verboseName).length).not.toBe(0);
    });
  });

  it("calls onChange function when a new option is clicked", async () => {
    const changeSpy = jest.fn();
    render(
      <InlineOperatorSelector
        fieldName="field nombre"
        operators={operatorOptions}
        value="="
        onChange={changeSpy}
      />,
    );

    userEvent.click(screen.getByText("Equal to"));
    await screen.findByTestId("operator-options");

    userEvent.click(screen.getByText("Less than or equal to"));
    expect(changeSpy).toHaveBeenCalledWith("<=");
  });
});
