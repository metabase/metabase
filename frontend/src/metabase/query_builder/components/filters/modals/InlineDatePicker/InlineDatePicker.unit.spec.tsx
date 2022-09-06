// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { metadata } from "__support__/sample_database_fixture";

import Field from "metabase-lib/lib/metadata/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Question from "metabase-lib/lib/Question";

import { InlineDatePicker } from "./InlineDatePicker";

const dateField = new Field({
  database_type: "test",
  base_type: "type/DateTime",
  semantic_type: "type/DateTime",
  effective_type: "type/DateTime",
  table_id: 8,
  name: "date_field",
  has_field_values: "none",
  values: [],
  dimensions: {},
  dimension_options: [],
  id: 138,
  metadata,
});

metadata.fields[dateField.id] = dateField;

const card = {
  dataset_query: {
    database: 5,
    query: {
      "source-table": 8,
    },
    type: "query",
  },
  display: "table",
  visualization_settings: {},
};

const question = new Question(card, metadata);
const dateDimension = dateField.dimension();
const query = question.query();

const newFilter = new Filter(
  [null, ["field", dateField.id, null]],
  null,
  question.query(),
);

describe("InlineDatePicker", () => {
  it("renders an inline date picker with shortcut buttons", () => {
    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={undefined}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    screen.getByTestId("date-picker");
    screen.getByText("Today");
    screen.getByText("Yesterday");
    screen.getByText("Last Week");
    screen.getByText("Last Month");
    screen.getByLabelText("more options");
  });

  it("populates an existing shortcut value", () => {
    const testFilter = new Filter(
      [
        "time-interval",
        ["field", dateField.id, null],
        -1,
        "day",
        { include_current: false },
      ],
      null,
      query,
    );

    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    expect(screen.getByText("Yesterday")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("populates an existing custom value", () => {
    const testFilter = new Filter(
      ["between", ["field", dateField.id, null], "1605-11-05", "2005-11-05"],
      null,
      query,
    );

    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    screen.getByText("between November 5, 1605 November 5, 2005");
  });

  it("populates a complex custom value", () => {
    // as of 6/20/22 this MBQL works, but throws warnings
    const testFilter = new Filter(
      [
        "between",
        ["+", ["field", dateField.id, null], ["interval", 66, "year"]],
        ["relative-datetime", -22, "day"],
        ["relative-datetime", 0, "day"],
      ],
      null,
      query,
    );

    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    screen.getByText("Previous 22 Days, starting 66 years ago");
  });

  it("adds a shortcut value", () => {
    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={undefined}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    screen.getByText("Last Week").click();

    expect(changeSpy).toHaveBeenCalledWith([
      "time-interval",
      ["field", dateField.id, null],
      -1,
      "week",
      { include_current: false },
    ]);
  });

  it("changes a shortcut value", () => {
    const testFilter = new Filter(
      [
        "time-interval",
        ["field", dateField.id, null],
        -1,
        "day",
        { include_current: false },
      ],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    expect(screen.getByText("Yesterday")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    screen.getByText("Last Week").click();

    expect(changeSpy).toHaveBeenCalledWith([
      "time-interval",
      ["field", dateField.id, null],
      -1,
      "week",
      { include_current: false },
    ]);
  });

  it("clears a shortcut value", () => {
    const testFilter = new Filter(
      [
        "time-interval",
        ["field", dateField.id, null],
        -1,
        "day",
        { include_current: false },
      ],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const clearSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={clearSpy}
      />,
    );

    expect(screen.getByText("Yesterday")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // clicking a selected shortcut value again de-selects it and clears the filter
    screen.getByText("Yesterday").click();

    expect(changeSpy).not.toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it.skip("adds a custom value", async () => {
    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={undefined}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    screen.getByLabelText("more options").click();
    await waitFor(() => screen.getByText("Relative dates..."));
    screen.getByText("Relative dates...").click();
    await waitFor(() => screen.getByTestId("relative-datetime-value"));

    const input = screen.getByTestId("relative-datetime-value");
    userEvent.clear(input);
    userEvent.type(input, "88");
    // FIXME: for some reason this button never gets enabled
    await waitFor(() =>
      expect(screen.getByText("Add filter")).not.toBeDisabled(),
    );
    screen.getByText("Add filter").click();
    await waitFor(() => expect(changeSpy).toHaveBeenCalled());

    expect(changeSpy).toHaveBeenCalledWith([
      "time-interval",
      ["field", dateField.id, null],
      -88,
      "day",
    ]);
  });

  it.skip("changes a custom value", async () => {
    const testFilter = new Filter(
      ["between", ["field", dateField.id, null], "1605-11-05", "2005-11-05"],
      null,
      query,
    );

    const changeSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={changeSpy}
      />,
    );

    const btn = screen.getByText("between November 5, 1605 November 5, 2005");
    userEvent.click(btn);
    await waitFor(() => screen.getByDisplayValue("11/05/1605"));
    const input = screen.getByDisplayValue("11/05/1605");

    userEvent.clear(input);
    userEvent.type(input, "09/05/1995");

    // FIXME: for some reason this button never gets enabled
    await waitFor(() =>
      expect(screen.getByText("Update filter")).not.toBeDisabled(),
    );

    screen.getByText("Update filter").click();

    expect(changeSpy).toBeCalledWith([
      "between",
      ["field", dateField.id, null],
      "1995-09-05",
      "2005-11-05",
    ]);
  });

  it("clears a custom value", () => {
    const testFilter = new Filter(
      ["between", ["field", dateField.id, null], "1605-11-05", "2005-11-05"],
      null,
      query,
    );

    const changeSpy = jest.fn();
    const clearSpy = jest.fn();

    render(
      <InlineDatePicker
        query={query}
        filter={testFilter}
        newFilter={newFilter}
        dimension={dateDimension}
        onChange={changeSpy}
        onClear={clearSpy}
      />,
    );

    const clearBtn = screen.getByLabelText("close icon");
    userEvent.click(clearBtn);
    expect(clearSpy).toBeCalledTimes(1);
    expect(changeSpy).toBeCalledTimes(0);
  });
});
