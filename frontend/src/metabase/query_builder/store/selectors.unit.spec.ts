import { assoc } from "icepick";

import { createMockMetadata } from "__support__/metadata";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import type {
  QueryBuilderState,
  QueryBuilderUIControls,
  Range,
} from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  TableId,
  TestNativeQuerySpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockTableColumnOrderSetting,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getEmbeddedParameterVisibilityGetter,
  getIsResultDirty,
  getIsVisualized,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestion,
  getQuestionDetailsTimelineDrawerState,
  getShouldShowUnsavedChangesWarning,
  getSubmittableQuestion,
} from "./selectors";

registerVisualizations();

function getBaseState({
  uiControls = {},
  ...state
}: Partial<Omit<QueryBuilderState, "uiControls">> & {
  uiControls?: Partial<QueryBuilderUIControls>;
} = {}) {
  return createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: state.card != null ? [state.card] : [],
    }),
    qb: createMockQueryBuilderState({
      ...state,
      uiControls: createMockQueryBuilderUIControlsState({
        queryBuilderMode: "view",
        ...uiControls,
      }),
    }),
  });
}

describe("getQuestion", () => {
  it("should be nothing if card data is missing", () => {
    const state = getBaseState({ card: null });
    expect(getQuestion(state)).toBe(undefined);
  });

  it("should return question instance correctly", () => {
    const card = createMockCard({
      id: 5,
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
    });

    const question = getQuestion(getBaseState({ card }));

    expect(question).toBeInstanceOf(Question);
    expect(question?._doNotCallSerializableCard()).toEqual(card);
  });

  it("should return composed dataset when dataset is open", () => {
    const card = createMockCard({
      id: 1,
      type: "model",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
    });

    const question = getQuestion(getBaseState({ card }));

    expect(question && Lib.primarySourceCardId(question.query())).toBe(1);
  });

  it("should return real dataset when dataset is open in 'dataset' QB mode", () => {
    const card = createMockCard({
      id: 5,
      type: "model",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      ),
    });

    const question = getQuestion(
      getBaseState({
        card,
        uiControls: {
          queryBuilderMode: "dataset",
        },
      }),
    );

    expect(question?.card()).toEqual(assoc(card, "displayIsLocked", true));
  });
});

describe("getIsResultDirty", () => {
  describe("structured query", () => {
    function getCard(query: Lib.Query) {
      return createMockCard({ dataset_query: Lib.toJsQuery(query) });
    }

    function getState(lastRunQuery: Lib.Query, query: Lib.Query) {
      return getBaseState({
        card: getCard(query),
        lastRunCard: getCard(lastRunQuery),
      });
    }

    function createOrdersQuery(
      stage: Omit<TestStageWithSourceSpec, "source"> = {},
    ) {
      return Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: ORDERS_ID }, ...stage }],
      });
    }

    it("should be dirty if the table was changed", () => {
      const state = getState(
        createOrdersQuery(),
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
        }),
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should be dirty if the fields were changed", () => {
      const state = getState(
        createOrdersQuery({ fields: [{ type: "column", name: "ID" }] }),
        createOrdersQuery({ fields: [{ type: "column", name: "TOTAL" }] }),
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("converts clauses into plain MBQL objects", () => {
      const query = createOrdersQuery({
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [{ type: "column", name: "CREATED_AT" }],
        filters: [
          {
            type: "operator",
            operator: ">",
            args: [
              { type: "column", name: "TOTAL" },
              { type: "literal", value: 20 },
            ],
          },
        ],
        joins: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            strategy: "left-join",
            alias: "Products",
            conditions: [
              {
                operator: "=",
                left: { type: "column", name: "PRODUCT_ID" },
                right: { type: "column", name: "ID" },
              },
            ],
          },
        ],
      });

      const state = getState(query, query);

      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if the fields were reordered", () => {
      const state = getState(
        createOrdersQuery({
          fields: [
            { type: "column", name: "ID" },
            { type: "column", name: "TOTAL" },
          ],
        }),
        createOrdersQuery({
          fields: [
            { type: "column", name: "TOTAL" },
            { type: "column", name: "ID" },
          ],
        }),
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if fields with fk refs were reordered", () => {
      const fkColumn = {
        type: "column",
        name: "CATEGORY",
        sourceFieldId: ORDERS.PRODUCT_ID,
      } as const;
      const idColumn = { type: "column", name: "ID" } as const;
      const state = getState(
        createOrdersQuery({ fields: [fkColumn, idColumn] }),
        createOrdersQuery({ fields: [idColumn, fkColumn] }),
      );
      expect(getIsResultDirty(state)).toBe(false);
    });
  });

  describe("native query", () => {
    function getCard(spec: TestNativeQuerySpec) {
      return createMockCard({
        query_type: "native",
        dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, spec),
      });
    }

    function getState(
      lastRunCardQuery: TestNativeQuerySpec,
      cardQuery: TestNativeQuerySpec,
    ) {
      return getBaseState({
        card: getCard(cardQuery),
        lastRunCard: getCard(lastRunCardQuery),
      });
    }

    it("should not be dirty if template-tags is empty vs an empty object", () => {
      const state = getState(
        {
          query: "SELECT 1",
        },
        { query: "SELECT 1", templateTags: {} },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if template-tags differ", () => {
      const state = getState(
        {
          query: "SELECT {{foo}}",
          templateTags: { foo: { type: "text", name: "foo" } },
        },
        {
          query: "SELECT {{bar}}",
          templateTags: { bar: { type: "text", name: "bar" } },
        },
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    describe("native editor selection/cursor", () => {
      function getStateWithSelectedQueryText(ranges: Range[]) {
        return getBaseState({
          card: createMockCard({
            query_type: "native",
            dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
              query: "1\n22\n333",
            }),
          }),
          uiControls: {
            nativeEditorSelectedRange: ranges,
          },
        });
      }

      [
        [{ row: 0, column: 0 }, 0] as const,
        [{ row: 1, column: 1 }, 3] as const,
        [{ row: 2, column: 3 }, 8] as const,
      ].forEach(([position, offset]) =>
        it(`should correctly determine the cursor offset for ${JSON.stringify(
          position,
        )}`, () => {
          const state = getStateWithSelectedQueryText([
            { start: position, end: position },
          ]);
          expect(getNativeEditorCursorOffset(state)).toBe(offset);
        }),
      );

      [
        [{ row: 0, column: 0 }, { row: 0, column: 0 }, ""] as const,
        [{ row: 0, column: 0 }, { row: 2, column: 3 }, "1\n22\n333"] as const,
        [{ row: 1, column: 0 }, { row: 1, column: 2 }, "22"] as const,
      ].forEach(([start, end, text]) =>
        it(`should correctly get selected text from ${JSON.stringify(
          start,
        )} to ${JSON.stringify(end)}`, () => {
          const state = getStateWithSelectedQueryText([{ start, end }]);
          expect(getNativeEditorSelectedText(state)).toBe(text);
        }),
      );

      it("should correctly get selected text when there are multiple selected ranges", () => {
        const state = getStateWithSelectedQueryText([
          { start: { row: 2, column: 0 }, end: { row: 2, column: 2 } },
          { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
        ]);
        expect(getNativeEditorSelectedText(state)).toBe("33");
      });
    });
  });

  describe("models", () => {
    function getDataset(query: Lib.Query) {
      return createMockCard({
        id: MODEL_ID,
        type: "model",
        dataset_query: Lib.toJsQuery(query),
      });
    }

    const MODEL_ID = 1;
    const dataset = getDataset(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [{ source: { type: "table", id: ORDERS_ID } }],
      }),
    );
    const modelProvider = createMetadataProvider({
      metadata: createMockMetadata({
        databases: [createSampleDatabase()],
        questions: [dataset],
      }),
    });
    const adHocDatasetCard = getDataset(
      Lib.createTestQuery(modelProvider, {
        stages: [{ source: { type: "card", id: MODEL_ID } }],
      }),
    );

    it("should not be dirty if model is not changed", () => {
      const state = getBaseState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: dataset,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if model is changed", () => {
      const state = getBaseState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: getDataset(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
          }),
        ),
      });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty if model simple mode is active", () => {
      const state = getBaseState({
        card: adHocDatasetCard,
        originalCard: dataset,
        lastRunCard: adHocDatasetCard,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty when building a new question on a model", () => {
      const card = createMockCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(modelProvider, {
            stages: [
              {
                source: { type: "card", id: MODEL_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                ],
              },
            ],
          }),
        ),
      });
      const state = getBaseState({
        card,
        originalCard: dataset,
        lastRunCard: dataset,
      });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty when the last run question is the composed model and the current question is equivalent to the original", () => {
      const state = getBaseState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: adHocDatasetCard,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });
  });
});

describe("getQuestionDetailsTimelineDrawerState", () => {
  it("should return a string representing the state of the question history timeline drawer", () => {
    const state = getBaseState({
      uiControls: {
        questionDetailsTimelineDrawerState: "foo",
      },
    });
    expect(getQuestionDetailsTimelineDrawerState(state)).toBe("foo");
  });
});

describe("getIsVisualized", () => {
  it("should be false when there is a `table.columns` setting only", () => {
    const state = getBaseState({
      card: createMockCard({
        display: "table",
        visualization_settings: createMockVisualizationSettings({
          "table.columns": [createMockTableColumnOrderSetting()],
        }),
      }),
    });
    expect(getIsVisualized(state)).toBe(false);
  });

  it("should be true when the table is implicitly visualized as a pivot table", () => {
    const state = getBaseState({
      card: createMockCard({
        display: "table",
      }),
      queryResults: [
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                name: "count",
                base_type: "type/Integer",
                effective_type: "type/Integer",
                source: "aggregation",
              }),
              createMockColumn({
                name: "CATEGORY",
                base_type: "type/Text",
                effective_type: "type/Text",
                source: "breakout",
              }),
              createMockColumn({
                name: "VENDOR",
                base_type: "type/Text",
                effective_type: "type/Text",
                source: "breakout",
              }),
            ],
          }),
        }),
      ],
    });
    expect(getIsVisualized(state)).toBe(true);
  });
});

describe("getShouldShowUnsavedChangesWarning", () => {
  describe("when creating or editing a model", () => {
    function getModelCard(tableId: TableId) {
      return createMockCard({
        id: 1,
        type: "model",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [{ source: { type: "table", id: tableId } }],
          }),
        ),
      });
    }
    const model = getModelCard(ORDERS_ID);

    it("warns when creating a new model", () => {
      const state = getBaseState({
        card: model,
        originalCard: undefined,
        uiControls: { queryBuilderMode: "dataset" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("warns when an existing model has unsaved changes", () => {
      const state = getBaseState({
        card: getModelCard(PRODUCTS_ID),
        originalCard: model,
        uiControls: { queryBuilderMode: "dataset" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("does not warn when the model is unchanged", () => {
      const state = getBaseState({
        card: model,
        originalCard: model,
        uiControls: { queryBuilderMode: "dataset" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(false);
    });
  });

  describe("when editing a structured question", () => {
    const card = createMockCard({
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      ),
    });

    it("warns when modified from the notebook editor", () => {
      const state = getBaseState({
        card,
        originalCard: card,
        uiControls: {
          queryBuilderMode: "notebook",
          isModifiedFromNotebook: true,
        },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("does not warn when not modified from the notebook editor", () => {
      const state = getBaseState({
        card,
        originalCard: card,
        uiControls: {
          queryBuilderMode: "notebook",
          isModifiedFromNotebook: false,
        },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(false);
    });
  });

  describe("when creating a native question", () => {
    function getNativeCard(query: string) {
      return createMockCard({
        query_type: "native",
        dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query }),
      });
    }

    it("warns when the new native query is non-empty", () => {
      const state = getBaseState({
        card: getNativeCard("SELECT 1"),
        uiControls: { queryBuilderMode: "view" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("does not warn when the new native query is empty", () => {
      const state = getBaseState({
        card: getNativeCard(""),
        uiControls: { queryBuilderMode: "view" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(false);
    });
  });
});

describe("getSubmittableQuestion", () => {
  function getTimeseriesCard(opts?: Parameters<typeof createMockCard>[0]) {
    return createMockCard({
      display: "table",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count", args: [] }],
              breakouts: [
                { type: "column", name: "CREATED_AT", unit: "month" },
              ],
            },
          ],
        }),
      ),
      ...opts,
    });
  }

  it("sets the default display when the question has never been run (metabase#83091)", () => {
    const card = getTimeseriesCard();
    const state = getBaseState({ card });
    const question = checkNotNull(getQuestion(state));

    expect(getSubmittableQuestion(state, question).display()).toBe("line");
  });

  it("does not change the display after the question has been run", () => {
    const card = getTimeseriesCard();
    const state = getBaseState({
      card,
      lastRunCard: createMockCard(),
    });
    const question = checkNotNull(getQuestion(state));

    expect(getSubmittableQuestion(state, question).display()).toBe("table");
  });

  it("does not change the display for a question with a locked display", () => {
    // displayIsLocked is true for saved cards or if the user explicitly picks a display
    const card = getTimeseriesCard({ displayIsLocked: true });
    const state = getBaseState({ card });
    const question = checkNotNull(getQuestion(state));

    expect(getSubmittableQuestion(state, question).display()).toBe("table");
  });
});

describe("getEmbeddedParameterVisibilityGetter", () => {
  it("returns the same function for the same card", () => {
    const card = createMockCard();
    const state = getBaseState({ card });
    const nextState = getBaseState({ card });

    expect(nextState).not.toBe(state);
    expect(getEmbeddedParameterVisibilityGetter(nextState)).toBe(
      getEmbeddedParameterVisibilityGetter(state),
    );
  });

  it("returns a new function when the card changes", () => {
    const state = getBaseState({
      card: createMockCard({
        enable_embedding: true,
        embedding_params: { category: "enabled" },
      }),
    });
    const nextState = getBaseState({
      card: createMockCard({
        enable_embedding: true,
        embedding_params: { category: "locked" },
      }),
    });

    const getVisibility = getEmbeddedParameterVisibilityGetter(state);
    const getNextVisibility = getEmbeddedParameterVisibilityGetter(nextState);

    expect(getNextVisibility).not.toBe(getVisibility);
    expect(getNextVisibility("category")).toBe("locked");
  });

  it("returns null when embedding is off", () => {
    const state = getBaseState({
      card: createMockCard({
        enable_embedding: false,
        embedding_params: { category: "enabled" },
      }),
    });

    expect(getEmbeddedParameterVisibilityGetter(state)("category")).toBeNull();
  });

  it.each(["enabled", "locked"] as const)(
    "returns the stored %s value for a known slug",
    (visibility) => {
      const state = getBaseState({
        card: createMockCard({
          enable_embedding: true,
          embedding_params: { category: visibility },
        }),
      });

      expect(getEmbeddedParameterVisibilityGetter(state)("category")).toBe(
        visibility,
      );
    },
  );

  it("returns disabled for a missing slug", () => {
    const state = getBaseState({
      card: createMockCard({
        enable_embedding: true,
        embedding_params: { category: "enabled" },
      }),
    });

    expect(getEmbeddedParameterVisibilityGetter(state)("vendor")).toBe(
      "disabled",
    );
  });

  it("returns disabled when the card has no embedding params", () => {
    const state = getBaseState({
      card: createMockCard({
        enable_embedding: true,
        embedding_params: null,
      }),
    });

    expect(getEmbeddedParameterVisibilityGetter(state)("category")).toBe(
      "disabled",
    );
  });
});
