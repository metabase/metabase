import type {
  ClickAction,
  ReduxClickAction,
} from "metabase/visualizations/types";

import { withSummarizeColumnCallback } from "./utils";

function createReduxAction(name: string): ReduxClickAction {
  return {
    name,
    section: "sum",
    buttonType: "token",
    action: jest.fn(() => jest.fn()),
  };
}

function perform(action: ClickAction) {
  if (!("action" in action)) {
    throw new Error(`${action.name} has no redux action`);
  }
  return action.action();
}

describe("withSummarizeColumnCallback", () => {
  it("calls back when a summarize column action is performed, and keeps what it dispatches", () => {
    const onSummarizeColumn = jest.fn();
    const sum = createReduxAction("summarize-column.sum");
    const dispatcher = jest.fn();
    jest.mocked(sum.action).mockReturnValue(dispatcher);

    const [mappedSum] = withSummarizeColumnCallback([sum], onSummarizeColumn);
    expect(onSummarizeColumn).not.toHaveBeenCalled();

    expect(perform(mappedSum)).toBe(dispatcher);
    expect(onSummarizeColumn).toHaveBeenCalledTimes(1);
    expect(sum.action).toHaveBeenCalledTimes(1);
  });

  it("leaves the other actions as they are", () => {
    const onSummarizeColumn = jest.fn();
    const sort = createReduxAction("sort.ascending");
    const byTime = createReduxAction("summarize-column-by-time");

    const mapped = withSummarizeColumnCallback(
      [sort, byTime],
      onSummarizeColumn,
    );
    mapped.forEach(perform);

    expect(mapped).toEqual([sort, byTime]);
    expect(mapped[0]).toBe(sort);
    expect(mapped[1]).toBe(byTime);
    expect(onSummarizeColumn).not.toHaveBeenCalled();
  });
});
