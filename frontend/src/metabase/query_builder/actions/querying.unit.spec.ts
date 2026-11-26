import { createMockMetadata } from "__support__/metadata";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import * as runQuery from "metabase/querying/run-query";
import { ADD_METABOT_CARD_BASELINE } from "metabase/redux/query-builder";
import type { MetabotCardBaseline, State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QUERY_COMPLETED, RUN_QUERY } from "../store/actions";
import { queryBuilderReducer } from "../store/reducer";
import { getQuestion, toMetabotCardBaseline } from "../store/selectors";

import { queryCompleted, runQuestionQuery } from "./querying";

const DATABASE = createSampleDatabase();

const CARD = createMockCard({
  display: "table",
  query_type: "native",
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "select 1 as visible, 2 as hidden",
  }),
  visualization_settings: {
    "table.columns": [
      { name: "VISIBLE", enabled: true },
      { name: "HIDDEN", enabled: false },
    ],
  },
});

const getDataset = (columnNames: string[]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: columnNames.map((name) =>
        createMockColumn({ name, display_name: name, source: "native" }),
      ),
      rows: [columnNames.map((_, index) => index)],
    }),
  });

const ERROR_DATASET = createMockDataset({
  error: 'Column "FOO" not found',
  data: createMockDatasetData({ cols: [], rows: [] }),
});

interface SetupOpts {
  previousResult: Dataset;
  newResult: Dataset;
}

async function setup({ previousResult, newResult }: SetupOpts) {
  const metadata = createMockMetadata({ databases: [DATABASE] });
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [DATABASE] }),
    qb: createMockQueryBuilderState({
      card: CARD,
      queryResults: [previousResult],
    }),
  });
  const dispatch = jest.fn<unknown, [unknown]>();

  await queryCompleted(new Question(CARD, metadata), [newResult])(
    dispatch,
    () => state,
  );

  const completedAction = checkNotNull(
    dispatch.mock.calls.map(([action]) => action).find(isQueryCompletedAction),
  );

  return { completedCard: completedAction.payload.card };
}

type QueryCompletedAction = {
  type: typeof QUERY_COMPLETED;
  payload: { card: Card };
};

function isQueryCompletedAction(
  action: unknown,
): action is QueryCompletedAction {
  return (
    typeof action === "object" &&
    action !== null &&
    "type" in action &&
    action.type === QUERY_COMPLETED
  );
}

describe("queryCompleted", () => {
  it("keeps hidden native columns hidden and shows new ones (metabase#15393)", async () => {
    const { completedCard } = await setup({
      previousResult: getDataset(["VISIBLE", "HIDDEN"]),
      newResult: getDataset(["VISIBLE", "HIDDEN", "ADDED"]),
    });

    expect(completedCard.visualization_settings["table.columns"]).toEqual([
      { name: "VISIBLE", enabled: true },
      { name: "HIDDEN", enabled: false },
      { name: "ADDED", enabled: true },
    ]);
  });

  it("keeps the column settings when the query fails (metabase#16914)", async () => {
    const { completedCard } = await setup({
      previousResult: getDataset(["VISIBLE", "HIDDEN"]),
      newResult: ERROR_DATASET,
    });

    expect(completedCard.visualization_settings["table.columns"]).toEqual([
      { name: "VISIBLE", enabled: true },
      { name: "HIDDEN", enabled: false },
    ]);
  });
});

describe("runQuestionQuery", () => {
  function isRunQueryAction(action: unknown): action is {
    type: typeof RUN_QUERY;
    payload: { cancelQueryController: AbortController };
  } {
    return (
      typeof action === "object" &&
      action !== null &&
      "type" in action &&
      action.type === RUN_QUERY
    );
  }

  it("aborts the first query when a second run starts", async () => {
    const runApiSpy = jest
      .spyOn(runQuery, "runQuestionQuery")
      .mockReturnValue(new Promise(() => {}));

    const metadata = createMockMetadata({ databases: [DATABASE] });
    const question = new Question(CARD, metadata);
    let state = createMockState({
      qb: createMockQueryBuilderState(),
    });
    const dispatch = jest.fn<unknown, [unknown]>((action) => {
      if (isRunQueryAction(action)) {
        state = { ...state, qb: { ...state.qb, ...action.payload } };
      }

      return action;
    });

    const getRunQueryActions = () =>
      dispatch.mock.calls
        .map(([action]) => action)
        .filter((action) => isRunQueryAction(action));

    await runQuestionQuery({ overrideWithQuestion: question })(
      dispatch,
      () => state,
    );

    let runActions = getRunQueryActions();
    expect(runActions).toHaveLength(1);
    const firstController = runActions[0].payload.cancelQueryController;
    expect(firstController.signal.aborted).toBe(false);

    await runQuestionQuery({
      overrideWithQuestion: question,
    })(dispatch, () => state);

    runActions = getRunQueryActions();
    expect(runActions).toHaveLength(2);
    const secondController = runActions[1].payload.cancelQueryController;
    expect(secondController).not.toBe(firstController);
    expect(firstController.signal.aborted).toBe(true);
    expect(secondController.signal.aborted).toBe(false);

    expect(runApiSpy).toHaveBeenCalledTimes(2);
  });
});

describe("queryCompleted on a question Metabot opened", () => {
  // the query builder switches an unlocked table to a scalar for a single value
  const card = createMockCard({
    display: "table",
    displayIsLocked: false,
    query_type: "native",
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "select 1 as one",
    }),
  });

  const setup = async (
    getBaselines: (state: State) => MetabotCardBaseline[],
  ) => {
    const metadata = createMockMetadata({ databases: [DATABASE] });
    let state = createMockState({
      entities: createMockEntitiesState({ databases: [DATABASE] }),
      qb: createMockQueryBuilderState({ card }),
    });
    state = {
      ...state,
      qb: { ...state.qb, metabotCardBaselines: getBaselines(state) },
    };
    // the store's reducer runs, so the thunk reads the completed card back
    const dispatch = jest.fn((action) => {
      state = { ...state, qb: queryBuilderReducer(state.qb, action) };
    });

    await queryCompleted(new Question(card, metadata), [getDataset(["ONE"])])(
      dispatch,
      () => state,
    );

    return { dispatch, state };
  };

  const baselineOf = (state: State) =>
    toMetabotCardBaseline(checkNotNull(getQuestion(state)));

  it("adds the display the query builder picked and keeps the loaded one for Back", async () => {
    let loaded: MetabotCardBaseline | undefined;
    const { state } = await setup((state) => {
      loaded = baselineOf(state);
      return [loaded];
    });

    expect(getQuestion(state)?.display()).toBe("scalar");
    expect(state.qb.metabotCardBaselines).toEqual([
      checkNotNull(loaded),
      baselineOf(state),
    ]);
  });

  it("keeps one copy of a baseline added twice", async () => {
    const { state } = await setup((state) => [baselineOf(state)]);
    const qb = queryBuilderReducer(state.qb, {
      type: ADD_METABOT_CARD_BASELINE,
      payload: baselineOf(state),
    });

    expect(qb.metabotCardBaselines).toEqual(state.qb.metabotCardBaselines);
  });

  it("leaves the baselines alone when the question is not Metabot's", async () => {
    const { dispatch } = await setup(() => []);

    expect(
      dispatch.mock.calls.filter(
        ([action]) => action?.type === ADD_METABOT_CARD_BASELINE,
      ),
    ).toEqual([]);
  });
});
