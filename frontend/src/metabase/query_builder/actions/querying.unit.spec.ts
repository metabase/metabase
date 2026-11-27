import { createMockMetadata } from "__support__/metadata";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { ADD_METABOT_CARD_BASELINE } from "metabase/redux/query-builder";
import type { MetabotCardBaseline, State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dataset,
  DatasetColumn,
  TestQuerySpec,
  TestStageSpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QUERY_COMPLETED } from "../store/actions";
import { queryBuilderReducer } from "../store/reducer";
import { getQuestion, toMetabotCardBaseline } from "../store/selectors";

import { queryCompleted } from "./querying";

registerVisualizations();

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
  previousCard?: Card;
  previousResult?: Dataset;
  card?: Card;
  newResult: Dataset;
}

async function setup({
  previousCard = CARD,
  previousResult,
  card = previousCard,
  newResult,
}: SetupOpts) {
  const metadata = createMockMetadata({ databases: [DATABASE] });
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [DATABASE] }),
    qb: createMockQueryBuilderState({
      card: previousCard,
      queryResults: previousResult ? [previousResult] : null,
    }),
  });
  const dispatch = jest.fn<unknown, [unknown]>();

  await queryCompleted(new Question(card, metadata), [newResult])(
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

describe("queryCompleted on a map", () => {
  const COUNT_BY_COORDINATES: TestStageWithSourceSpec = {
    source: { type: "table", id: PEOPLE_ID },
    aggregations: [{ type: "operator", operator: "count" }],
    breakouts: [
      {
        type: "column",
        fieldId: PEOPLE.LATITUDE,
        binning: { strategy: "default" },
      },
      {
        type: "column",
        fieldId: PEOPLE.LONGITUDE,
        binning: { strategy: "default" },
      },
    ],
  };

  const COUNT_GREATER_THAN_2: TestStageSpec = {
    filters: [
      {
        type: "operator",
        operator: ">",
        args: [
          { type: "column", name: "count" },
          { type: "literal", value: 2 },
        ],
      },
    ],
  };

  const LATITUDE = createMockColumn({
    name: "LATITUDE",
    display_name: "Latitude: 10°",
    base_type: "type/Float",
    semantic_type: "type/Latitude",
    source: "breakout",
    binning_info: { binning_strategy: "bin-width", bin_width: 10 },
  });
  const LONGITUDE = createMockColumn({
    name: "LONGITUDE",
    display_name: "Longitude: 10°",
    base_type: "type/Float",
    semantic_type: "type/Longitude",
    source: "breakout",
    binning_info: { binning_strategy: "bin-width", bin_width: 10 },
  });
  const BIRTH_DATE = createMockColumn({
    name: "BIRTH_DATE",
    display_name: "Birth Date: Month",
    base_type: "type/Date",
    source: "breakout",
    unit: "month",
  });
  const COUNT = createMockColumn({
    name: "count",
    display_name: "Count",
    base_type: "type/BigInteger",
    source: "aggregation",
  });
  const AVG_LONGITUDE = createMockColumn({
    name: "avg",
    display_name: "Average of Longitude",
    base_type: "type/Float",
    source: "aggregation",
  });

  const getMapCard = (stages: TestQuerySpec["stages"], opts?: Partial<Card>) =>
    createMockCard({
      display: "map",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, { stages }),
      visualization_settings: { "map.type": "grid" },
      ...opts,
    });

  const getMapDataset = (cols: DatasetColumn[]) =>
    createMockDataset({
      data: createMockDatasetData({
        cols,
        rows: [
          cols.map((_, index) => index + 10),
          cols.map((_, index) => index + 20),
        ],
      }),
    });

  const PREVIOUS_CARD = getMapCard([COUNT_BY_COORDINATES]);
  const PREVIOUS_RESULT = getMapDataset([LATITUDE, LONGITUDE, COUNT]);

  it("keeps the map after a filter on the count (metabase#32075)", async () => {
    const { completedCard } = await setup({
      previousCard: PREVIOUS_CARD,
      previousResult: PREVIOUS_RESULT,
      card: getMapCard([COUNT_BY_COORDINATES, COUNT_GREATER_THAN_2]),
      newResult: getMapDataset([LATITUDE, LONGITUDE, COUNT]),
    });

    expect(completedCard.display).toBe("map");
  });

  it("keeps the map after another breakout", async () => {
    const { completedCard } = await setup({
      previousCard: PREVIOUS_CARD,
      previousResult: PREVIOUS_RESULT,
      card: getMapCard([
        {
          ...COUNT_BY_COORDINATES,
          breakouts: [
            ...(COUNT_BY_COORDINATES.breakouts ?? []),
            { type: "column", fieldId: PEOPLE.BIRTH_DATE, unit: "month" },
          ],
        },
      ]),
      newResult: getMapDataset([LATITUDE, LONGITUDE, BIRTH_DATE, COUNT]),
    });

    expect(completedCard.display).toBe("map");
  });

  it("keeps the map after another aggregation", async () => {
    const { completedCard } = await setup({
      previousCard: PREVIOUS_CARD,
      previousResult: PREVIOUS_RESULT,
      card: getMapCard([
        {
          ...COUNT_BY_COORDINATES,
          aggregations: [
            ...(COUNT_BY_COORDINATES.aggregations ?? []),
            {
              type: "operator",
              operator: "avg",
              args: [{ type: "column", fieldId: PEOPLE.LONGITUDE }],
            },
          ],
        },
      ]),
      newResult: getMapDataset([LATITUDE, LONGITUDE, COUNT, AVG_LONGITUDE]),
    });

    expect(completedCard.display).toBe("map");
  });

  it("switches to the default display when a removed breakout leaves no coordinates pair", async () => {
    const { completedCard } = await setup({
      previousCard: PREVIOUS_CARD,
      previousResult: PREVIOUS_RESULT,
      card: getMapCard([
        {
          ...COUNT_BY_COORDINATES,
          breakouts: [
            {
              type: "column",
              fieldId: PEOPLE.LONGITUDE,
              binning: { strategy: "default" },
            },
          ],
        },
      ]),
      newResult: getMapDataset([LONGITUDE, COUNT]),
    });

    expect(completedCard.display).toBe("bar");
  });

  it("keeps a locked map after a filter on the count (metabase#30058)", async () => {
    const card = getMapCard([COUNT_BY_COORDINATES, COUNT_GREATER_THAN_2], {
      displayIsLocked: true,
    });
    const { completedCard } = await setup({
      previousCard: card,
      card,
      newResult: getMapDataset([LATITUDE, LONGITUDE, COUNT]),
    });

    expect(completedCard.display).toBe("map");
  });

  it("keeps a pin map on native results whose first column is the longitude (metabase#14254)", async () => {
    const card = createMockCard({
      display: "map",
      query_type: "native",
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "SELECT LONGITUDE, LATITUDE, CITY FROM PEOPLE LIMIT 10",
      }),
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    });
    const { completedCard } = await setup({
      previousCard: card,
      newResult: getMapDataset([
        createMockColumn({
          name: "LONGITUDE",
          base_type: "type/Float",
          semantic_type: "type/Longitude",
          source: "native",
        }),
        createMockColumn({
          name: "LATITUDE",
          base_type: "type/Float",
          semantic_type: "type/Latitude",
          source: "native",
        }),
        createMockColumn({
          name: "CITY",
          base_type: "type/Text",
          semantic_type: "type/City",
          source: "native",
        }),
      ]),
    });

    expect(completedCard.display).toBe("map");
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
