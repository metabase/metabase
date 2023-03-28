import React from "react";
import { fireEvent, render, screen } from "__support__/ui";

import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { createMockNotebookStep, DEFAULT_LEGACY_QUERY } from "../../test-utils";
import LimitStep from "./LimitStep";

const DEFAULT_LIMIT = 10;

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <LimitStep
      step={step}
      query={step.query}
      topLevelQuery={step.topLevelQuery}
      color="brand"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery() {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0] as StructuredQuery;
  }

  return { getNextQuery, updateQuery };
}

describe("LimitStep", () => {
  it("should render correctly without a limit", () => {
    setup();
    expect(screen.getByPlaceholderText("Enter a limit")).toBeInTheDocument();
  });

  it("should render correctly with limit set", () => {
    const query = DEFAULT_LEGACY_QUERY.updateLimit(DEFAULT_LIMIT);
    const step = createMockNotebookStep({ query });
    setup(step);

    expect(screen.getByDisplayValue(String(DEFAULT_LIMIT))).toBeInTheDocument();
  });

  it("should set the limit", () => {
    const { getNextQuery } = setup();
    const limitInput = screen.getByPlaceholderText("Enter a limit");

    fireEvent.change(limitInput, { target: { value: "52" } });

    expect(getNextQuery().limit()).toBe(52);
  });

  it("should update the limit", () => {
    const query = DEFAULT_LEGACY_QUERY.updateLimit(DEFAULT_LIMIT);
    const step = createMockNotebookStep({ query });
    const { getNextQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "1000" } });

    expect(getNextQuery().limit()).toBe(1000);
  });

  it("shouldn't update the limit if zero provided", () => {
    const query = DEFAULT_LEGACY_QUERY.updateLimit(DEFAULT_LIMIT);
    const step = createMockNotebookStep({ query });
    const { updateQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "0" } });

    expect(updateQuery).not.toHaveBeenCalled();
  });

  it("shouldn't update the limit if its negative", () => {
    const query = DEFAULT_LEGACY_QUERY.updateLimit(DEFAULT_LIMIT);
    const step = createMockNotebookStep({ query });
    const { updateQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "-1" } });

    expect(updateQuery).not.toHaveBeenCalled();
  });
});
