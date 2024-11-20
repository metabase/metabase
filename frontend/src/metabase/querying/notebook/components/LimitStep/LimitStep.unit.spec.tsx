import { fireEvent, render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";

import { DEFAULT_QUERY, createMockNotebookStep } from "../../test-utils";

import { LimitStep } from "./LimitStep";

const DEFAULT_LIMIT = 10;
const QUERY_WITH_LIMIT = Lib.limit(DEFAULT_QUERY, 0, DEFAULT_LIMIT);

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <LimitStep
      step={step}
      query={step.query}
      color="brand"
      stageIndex={step.stageIndex}
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery() {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  return { getNextQuery, updateQuery };
}

describe("LimitStep", () => {
  it("should render correctly without a limit", () => {
    setup();
    expect(screen.getByPlaceholderText("Enter a limit")).toBeInTheDocument();
  });

  it("should render correctly with limit set", () => {
    const step = createMockNotebookStep({ query: QUERY_WITH_LIMIT });
    setup(step);

    expect(screen.getByDisplayValue(String(DEFAULT_LIMIT))).toBeInTheDocument();
  });

  it("should set the limit", () => {
    const { getNextQuery } = setup();
    const limitInput = screen.getByPlaceholderText("Enter a limit");

    fireEvent.change(limitInput, { target: { value: "52" } });
    fireEvent.blur(limitInput);

    expect(Lib.currentLimit(getNextQuery(), 0)).toBe(52);
  });

  it("should update the limit only when blurred", () => {
    const step = createMockNotebookStep({ query: QUERY_WITH_LIMIT });
    const { getNextQuery, updateQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");

    fireEvent.focus(limitInput);

    // HACK: manually set document.activeElement to the input
    // so the focus check works.
    Object.defineProperty(document, "activeElement", {
      value: limitInput,
      writable: false,
    });

    fireEvent.change(limitInput, { target: { value: "100" } });
    fireEvent.change(limitInput, { target: { value: "1000" } });
    fireEvent.blur(limitInput);

    expect(updateQuery).toHaveBeenCalledTimes(1);
    expect(Lib.currentLimit(getNextQuery(), 0)).toBe(1000);
  });

  it("should update the limit when not focused (eg. when clicking the arrows) (metabase#49587)", () => {
    const step = createMockNotebookStep({ query: QUERY_WITH_LIMIT });
    const { getNextQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "1000" } });

    expect(Lib.currentLimit(getNextQuery(), 0)).toBe(1000);
  });

  it("shouldn't update the limit if zero provided", () => {
    const step = createMockNotebookStep({ query: QUERY_WITH_LIMIT });
    const { updateQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "0" } });

    expect(updateQuery).not.toHaveBeenCalled();
  });

  it("shouldn't update the limit if its negative", () => {
    const step = createMockNotebookStep({ query: QUERY_WITH_LIMIT });
    const { updateQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "-1" } });

    expect(updateQuery).not.toHaveBeenCalled();
  });

  it("shouldn't update the limit if its not a valid number", () => {
    const step = createMockNotebookStep({ query: QUERY_WITH_LIMIT });
    const { updateQuery } = setup(step);

    const limitInput = screen.getByPlaceholderText("Enter a limit");
    fireEvent.change(limitInput, { target: { value: "not a number" } });

    expect(updateQuery).not.toHaveBeenCalled();
  });
});
