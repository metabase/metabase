import { createMockMetadata } from "__support__/metadata";
import ObjectDetailDrill from "metabase/modes/components/drill/ObjectDetailDrill";
import { ZOOM_IN_ROW } from "metabase/query_builder/actions";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { TYPE as SEMANTIC_TYPE } from "cljs/metabase.types";
import Question from "metabase-lib/Question";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const orderIDField = metadata.field(ORDERS.ID);
const orderIDColumn = metadata.field(ORDERS.ID).column();

const DEFAULT_CELL_VALUE = 1;

function setup({
  question = ordersTable.question(),
  column = orderIDColumn,
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
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
      },
    },
  },
  metadata,
);

describe("ObjectDetailDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = ObjectDetailDrill({ question: ordersTable.question() });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked value is undefined", () => {
    const actions = ObjectDetailDrill({
      question: ordersTable.question(),
      clicked: {
        column: orderIDColumn,
        value: undefined,
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid non-PK cells", () => {
    const { actions: totalActions } = setup({
      column: metadata.field(ORDERS.TOTAL).column(),
    });
    const { actions: createdAtActions } = setup({
      column: metadata.field(ORDERS.CREATED_AT).column(),
    });
    expect(totalActions).toHaveLength(0);
    expect(createdAtActions).toHaveLength(0);
  });

  it("should not be available for not editable queries", () => {
    const question = ordersTable.question();
    question.query().isEditable = () => false;

    const pk = setup({
      question,
      column: orderIDColumn,
    });
    const fk = setup({
      question,
      column: metadata.field(ORDERS.PRODUCT_ID).column(),
    });

    expect(pk.actions).toHaveLength(0);
    expect(fk.actions).toHaveLength(0);
  });

  describe("PK cells", () => {
    describe("general", () => {
      const mockDispatch = jest.fn();
      const mockGetState = () => ({ qb: { queryResults: {}, card: {} } });
      const { actions, cellValue } = setup({
        column: orderIDColumn,
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
          const question = ordersTable.question();
          const orderTotalField = question
            .query()
            .table()
            .fields.find(field => field.id === ORDERS.TOTAL);
          orderTotalField.semantic_type = SEMANTIC_TYPE.PK;

          const { actions, cellValue } = setup({
            question,
            column: orderIDColumn,
          });

          it("should return object detail filter", () => {
            expect(actions).toMatchObject([
              { name: "object-detail", question: expect.any(Function) },
            ]);
          });

          it("should apply '=' filter to one of the PKs on click", () => {
            const [action] = actions;
            expect(action.question().datasetQuery().query).toEqual({
              "source-table": ORDERS_ID,
              filter: ["=", orderIDField.reference(), cellValue],
            });
          });

          orderTotalField.semantic_type = null;
        });

        describe("when table metadata is unavailable", () => {
          let question = ordersTable.question();
          const fields = question.query().table().fields;
          question = question.setResultsMetadata({
            columns: fields.map(field => {
              if (field.id === ORDERS.TOTAL) {
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
            column: orderIDColumn,
          });

          it("should fallback to result metadata info about columns if table is not available", () => {
            const [action] = actions;
            expect(action.question().datasetQuery().query).toEqual({
              "source-table": ORDERS_ID,
              filter: ["=", orderIDField.reference(), cellValue],
            });
          });
        });
      });
    });

    describe("from dashboard", () => {
      describe("without parameters", () => {
        const { actions } = setup({
          question: SAVED_QUESTION,
          column: orderIDColumn,
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
        column: orderIDColumn,
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
        column: metadata.field(ORDERS.PRODUCT_ID).column(),
      });

      it("should return object detail filter", () => {
        expect(actions).toMatchObject([
          { name: "object-detail", question: expect.any(Function) },
        ]);
      });

      it("should apply object detail filter correctly", () => {
        const [action] = actions;
        expect(action.question().datasetQuery().query).toEqual({
          "source-table": PRODUCTS_ID,
          filter: ["=", metadata.field(PRODUCTS.ID).reference(), cellValue],
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
          fk_target_field_id: PRODUCTS.ID,
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
          "source-table": PRODUCTS_ID,
          filter: ["=", metadata.field(PRODUCTS.ID).reference(), cellValue],
        });
      });
      it("should supply the foreign key as a return value from the extra() function", () => {
        const [action] = actions;
        expect(action.extra().objectId).toEqual(cellValue);
      });
    });
  });
});
