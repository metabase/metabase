import { createMockMetadata } from "__support__/metadata";
import { queryDrill } from "metabase/querying/drills/utils/query-drill";
import { isSummarizeColumnAction } from "metabase/querying/drills/utils/summarize-column-drill";
import type {
  ClickAction,
  ReduxClickAction,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockUnsavedCard } from "metabase-types/api/mocks";
import {
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { withSummarizeColumnCallback } from "./utils";

function getTotalHeaderActions() {
  const question = new Question(
    createMockUnsavedCard({
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    }),
    createMockMetadata({ databases: [createSampleDatabase()] }),
  );
  return queryDrill(
    question,
    { column: createOrdersTotalDatasetColumn() },
    () => true,
  );
}

function isReduxAction(action: ClickAction): action is ReduxClickAction {
  return "action" in action;
}

describe("withSummarizeColumnCallback", () => {
  it("calls back for each aggregation of the summarize column drill, and keeps what it dispatches", () => {
    const onSummarizeColumn = jest.fn<void, []>();
    const actions = getTotalHeaderActions();
    const summarizeActions = actions
      .filter(isSummarizeColumnAction)
      .filter(isReduxAction);
    expect(summarizeActions.map(({ section }) => section)).toEqual([
      "sum",
      "sum",
      "sum",
    ]);

    summarizeActions.forEach((action, index) => {
      const originalAction = jest.spyOn(action, "action");
      const [mapped] = withSummarizeColumnCallback(
        [action],
        onSummarizeColumn,
      ).filter(isReduxAction);
      expect(onSummarizeColumn).toHaveBeenCalledTimes(index);

      const dispatched = mapped.action();

      expect(onSummarizeColumn).toHaveBeenCalledTimes(index + 1);
      expect(originalAction).toHaveBeenCalledTimes(1);
      expect(dispatched).toBe(originalAction.mock.results[0].value);
    });
  });

  it("leaves the other header actions as they are", () => {
    const onSummarizeColumn = jest.fn<void, []>();
    const otherActions = getTotalHeaderActions().filter(
      (action) => !isSummarizeColumnAction(action),
    );
    expect(otherActions.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["sort.ascending", "summarize-column-by-time"]),
    );

    const mapped = withSummarizeColumnCallback(otherActions, onSummarizeColumn);
    mapped.filter(isReduxAction).forEach((action) => action.action());

    expect(mapped).toHaveLength(otherActions.length);
    mapped.forEach((action, index) => {
      expect(Object.is(action, otherActions[index])).toBe(true);
    });
    expect(onSummarizeColumn).not.toHaveBeenCalled();
  });
});
