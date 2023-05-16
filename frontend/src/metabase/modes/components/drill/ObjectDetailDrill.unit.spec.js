import ObjectDetailDrill from "metabase/modes/components/drill/ObjectDetailDrill";
import { ZOOM_IN_ROW } from "metabase/query_builder/actions";
import { TYPE as SEMANTIC_TYPE } from "cljs/metabase.types";
import {
  ORDERS,
  PRODUCTS,
  SAMPLE_DATABASE,
  metadata,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/Question";

const DEFAULT_CELL_VALUE = 1;

function setup({
  question = ORDERS.question(),
  column = ORDERS.ID.column(),
  value = DEFAULT_CELL_VALUE,
  extraData,
} = {}) {
  const actions = ObjectDetailDrill({
    question,
    clicked: { column, value, extraData },
  });
  return {
    actions,
    cellValue: value,
  };
}

const SAVED_QUESTION = new Question(
  {
    id: 1,
    name: "orders",
    dataset_query: {
      type: "query",
      database: SAMPLE_DATABASE.id,
      query: {
        "source-table": ORDERS.id,
      },
    },
  },
  metadata,
);

describe("ObjectDetailDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = ObjectDetailDrill({ question: ORDERS.question() });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked value is undefined", () => {
    const actions = ObjectDetailDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.ID.column(),
        value: undefined,
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid non-PK cells", () => {
    const { actions: totalActions } = setup({
      column: ORDERS.TOTAL.column(),
    });
    const { actions: createdAtActions } = setup({
      column: ORDERS.CREATED_AT.column(),
    });
    expect(totalActions).toHaveLength(0);
    expect(createdAtActions).toHaveLength(0);
  });

  it("should not be available for not editable queries", () => {
    const question = ORDERS.question();
    question.query().isEditable = () => false;

    const pk = setup({
      question,
      column: ORDERS.ID.column(),
    });
    const fk = setup({
      question,
      column: ORDERS.PRODUCT_ID.column(),
    });

    expect(pk.actions).toHaveLength(0);
    expect(fk.actions).toHaveLength(0);
  });

  describe("PK cells", () => {
    describe("general", () => {
      const mockDispatch = jest.fn();
      const mockGetState = () => ({ qb: { queryResults: {}, card: {} } });
      const { actions, cellValue } = setup({
        column: ORDERS.ID.column(),
      });

      it("should return object detail filter", () => {
        expect(actions).toMatchObject([
          { name: "object-detail", action: expect.any(Function) },
        ]);
      });

      it("should return correct redux action", () => {
        const [action] = actions;
        action.action()(mockDispatch, mockGetState);
        expect(mockDispatch).toHaveBeenCalledWith({
          type: ZOOM_IN_ROW,
          payload: {
            objectId: cellValue,
          },
        });
      });

      describe("composite PK", () => {
        describe("default", () => {
          const question = ORDERS.question();
          const orderTotalField = question
            .query()
            .table()
            .fields.find(field => field.id === ORDERS.TOTAL.id);
          orderTotalField.semantic_type = SEMANTIC_TYPE.PK;

          const { actions, cellValue } = setup({
            question,
            column: ORDERS.ID.column(),
          });

          it("should return object detail filter", () => {
            expect(actions).toMatchObject([
              { name: "object-detail", question: expect.any(Function) },
            ]);
          });

          it("should apply '=' filter to one of the PKs on click", () => {
            const [action] = actions;
            expect(action.question().datasetQuery().query).toEqual({
              "source-table": ORDERS.id,
              filter: ["=", ORDERS.ID.reference(), cellValue],
            });
          });

          orderTotalField.semantic_type = null;
        });

        describe("when table metadata is unavailable", () => {
          let question = ORDERS.question();
          const fields = question.query().table().fields;
          question = question.setResultsMetadata({
            columns: fields.map(field => {
              if (field.id === ORDERS.TOTAL.id) {
                return {
                  ...field,
                  semantic_type: SEMANTIC_TYPE.PK,
                };
              }
              return field;
            }),
          });
          question.query().isEditable = () => true;
          question.query().table = () => null;

          const { actions, cellValue } = setup({
            question,
            column: ORDERS.ID.column(),
          });

          it("should fallback to result metadata info about columns if table is not available", () => {
            const [action] = actions;
            expect(action.question().datasetQuery().query).toEqual({
              "source-table": ORDERS.id,
              filter: ["=", ORDERS.ID.reference(), cellValue],
            });
          });
        });
      });
    });

    describe("from dashboard", () => {
      describe("without parameters", () => {
        const { actions } = setup({
          question: SAVED_QUESTION,
          column: ORDERS.ID.column(),
          extraData: {
            dashboard: { id: 5 },
          },
        });

        it("should return object detail filter", () => {
          expect(actions).toMatchObject([
            {
              name: "object-detail",
              question: expect.any(Function),
            },
          ]);
        });

        it("should return correct URL to object detail", () => {
          const [action] = actions;
          expect(action.question().getUrl()).toBe(
            `/question/${SAVED_QUESTION.slug()}`,
          );
        });
      });
    });

    describe("with parameters", () => {
      const { actions, cellValue } = setup({
        question: SAVED_QUESTION,
        column: ORDERS.ID.column(),
        extraData: {
          dashboard: { id: 5 },
          parameterValuesBySlug: {
            foo: "bar",
          },
        },
      });

      it("should return object detail filter", () => {
        expect(actions).toMatchObject([
          {
            name: "object-detail",
            question: expect.any(Function),
            extra: expect.any(Function),
          },
        ]);
      });

      it("should return correct action", () => {
        const [action] = actions;
        expect(action.question()).toBe(SAVED_QUESTION);
        expect(action.extra().objectId).toEqual(cellValue);
      });
    });
  });

  describe("FK cells", () => {
    describe("with a FK column", () => {
      const { actions, cellValue } = setup({
        column: ORDERS.PRODUCT_ID.column(),
      });

      it("should return object detail filter", () => {
        expect(actions).toMatchObject([
          { name: "object-detail", question: expect.any(Function) },
        ]);
      });

      it("should apply object detail filter correctly", () => {
        const [action] = actions;
        expect(action.question().datasetQuery().query).toEqual({
          "source-table": PRODUCTS.id,
          filter: ["=", PRODUCTS.ID.reference(), cellValue],
        });
      });

      it("should supply the foreign key as a return value from the extra() function", () => {
        const [action] = actions;
        expect(action.extra().objectId).toEqual(cellValue);
      });
    });

    describe("with fk_target_field_id (model with customized metadata)", () => {
      const { actions, cellValue } = setup({
        column: {
          semantic_type: SEMANTIC_TYPE.FK,
          fk_target_field_id: PRODUCTS.ID.id,
        },
      });

      it("should return object detail filter", () => {
        expect(actions).toMatchObject([
          { name: "object-detail", question: expect.any(Function) },
        ]);
      });

      it("should apply object detail filter correctly", () => {
        const [action] = actions;
        expect(action.question().datasetQuery().query).toEqual({
          "source-table": PRODUCTS.id,
          filter: ["=", PRODUCTS.ID.reference(), cellValue],
        });
      });
      it("should supply the foreign key as a return value from the extra() function", () => {
        const [action] = actions;
        expect(action.extra().objectId).toEqual(cellValue);
      });
    });
  });
});
