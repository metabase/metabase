import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import Filter from "metabase-lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { InlineDatePicker } from "./InlineDatePicker";

const DATE_FIELD_ID = 200;

describe("InlineDatePicker", () => {
  const card = createSavedStructuredCard();

  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    fields: [
      createMockField({
        id: DATE_FIELD_ID,
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
        semantic_type: "type/DateTime",
        has_field_values: "none",
      }),
    ],
    questions: [card],
  });

  const question = checkNotNull(metadata.question(card.id));

  const dateField = checkNotNull(metadata.field(DATE_FIELD_ID));
  const dateDimension = dateField.dimension();

  const query = question.query() as StructuredQuery;

  const newFilter = new Filter(
    [null, ["field", dateField.id, null]],
    null,
    query,
  );

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

    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Last Week")).toBeInTheDocument();
    expect(screen.getByText("Last Month")).toBeInTheDocument();
    expect(screen.getByLabelText("more options")).toBeInTheDocument();
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

    expect(
      screen.getByText("between November 5, 1605 November 5, 2005"),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText("Previous 22 Days, starting 66 years ago"),
    ).toBeInTheDocument();
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

  // eslint-disable-next-line jest/no-disabled-tests
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

    userEvent.click(screen.getByLabelText("more options"));
    await screen.findByText("Relative dates...");
    userEvent.click(screen.getByText("Relative dates..."));
    await screen.findByTestId("relative-datetime-value");

    const input = screen.getByTestId("relative-datetime-value");
    userEvent.clear(input);
    userEvent.type(input, "88");
    // FIXME: for some reason this button never gets enabled
    await waitFor(() => expect(screen.getByText("Add filter")).toBeEnabled());
    userEvent.click(screen.getByText("Add filter"));
    await waitFor(() => expect(changeSpy).toHaveBeenCalled());

    expect(changeSpy).toHaveBeenCalledWith([
      "time-interval",
      ["field", dateField.id, null],
      -88,
      "day",
    ]);
  });

  // eslint-disable-next-line jest/no-disabled-tests
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
    await screen.findByDisplayValue("11/05/1605");
    const input = screen.getByDisplayValue("11/05/1605");

    userEvent.clear(input);
    userEvent.type(input, "09/05/1995");

    // FIXME: for some reason this button never gets enabled
    await waitFor(() =>
      expect(screen.getByText("Update filter")).toBeEnabled(),
    );

    screen.getByText("Update filter").click();

    expect(changeSpy).toHaveBeenCalledWith([
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
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(0);
  });
});
