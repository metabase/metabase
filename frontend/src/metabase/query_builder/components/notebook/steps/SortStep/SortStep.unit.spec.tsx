import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon, queryIcon } from "__support__/ui";
import { ORDERS, PRODUCTS } from "__support__/sample_database_fixture";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { createMockNotebookStep, DEFAULT_LEGACY_QUERY } from "../../test-utils";
import SortStep from "./SortStep";

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <SortStep
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

describe("SortStep", () => {
  it("should render correctly without a sort", () => {
    setup();
    expect(getIcon("add")).toBeInTheDocument();
    expect(queryIcon("arrow_up")).not.toBeInTheDocument();
    expect(queryIcon("arrow_down")).not.toBeInTheDocument();
  });

  it("should render correctly with asc sort set", () => {
    const [field] = ORDERS.fields;
    const query = DEFAULT_LEGACY_QUERY.sort(["asc", field.reference()]);
    setup(createMockNotebookStep({ query }));

    expect(screen.getByText(field.displayName())).toBeInTheDocument();
    expect(getIcon("arrow_up")).toBeInTheDocument();
    expect(queryIcon("arrow_down")).not.toBeInTheDocument();
  });

  it("should render correctly with desc sort set", () => {
    const [field] = ORDERS.fields;
    const query = DEFAULT_LEGACY_QUERY.sort(["desc", field.reference()]);
    setup(createMockNotebookStep({ query }));

    expect(screen.getByText(field.displayName())).toBeInTheDocument();
    expect(getIcon("arrow_down")).toBeInTheDocument();
    expect(queryIcon("arrow_up")).not.toBeInTheDocument();
  });

  it("should display sortable columns", () => {
    setup();

    userEvent.click(getIcon("add"));

    expect(screen.getByText(ORDERS.objectName())).toBeInTheDocument();
    expect(screen.getByText(PRODUCTS.objectName())).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    ORDERS.fields.forEach(field =>
      expect(screen.getByText(field.displayName())).toBeInTheDocument(),
    );
  });

  it("should add a sort", () => {
    const { getNextQuery } = setup();

    userEvent.click(getIcon("add"));
    userEvent.click(screen.getByText("Created At"));

    const [sort] = getNextQuery().sorts();
    const [direction] = sort.raw();
    expect(sort.dimension().displayName()).toBe("Created At");
    expect(direction).toBe("asc");
  });

  it("should toggle sort direction", () => {
    const [field] = ORDERS.fields;
    const query = DEFAULT_LEGACY_QUERY.sort(["asc", field.reference()]);
    const { getNextQuery } = setup(createMockNotebookStep({ query }));

    userEvent.click(screen.getByLabelText("Change direction"));

    const [sort] = getNextQuery().sorts();
    const [direction] = sort.raw();
    expect(direction).toBe("desc");
  });

  it("should change sorting field", () => {
    const [field] = ORDERS.fields;
    const query = DEFAULT_LEGACY_QUERY.sort(["asc", field.reference()]);
    const { getNextQuery } = setup(createMockNotebookStep({ query }));

    userEvent.click(screen.getByText(field.displayName()));
    userEvent.click(screen.getByText("Created At"));

    const [sort] = getNextQuery().sorts();
    expect(sort.dimension().displayName()).toBe("Created At");
  });

  it("should remove sorting", () => {
    const [field] = ORDERS.fields;
    const query = DEFAULT_LEGACY_QUERY.sort(["asc", field.reference()]);
    const { getNextQuery } = setup(createMockNotebookStep({ query }));

    userEvent.click(getIcon("close"));

    expect(getNextQuery().sorts()).toHaveLength(0);
  });
});
