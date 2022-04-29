import Question from "metabase-lib/lib/Question";
import ObjectDetailDrill from "metabase/modes/components/drill/ObjectDetailDrill";
import { ZOOM_IN_ROW } from "metabase/query_builder/actions";
import { TYPE as SEMANTIC_TYPE } from "cljs/metabase.types";
import {
  ORDERS,
  PRODUCTS,
  SAMPLE_DATABASE,
  metadata,
} from "__support__/sample_database_fixture";

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
        action.action()(mockDispatch);
        expect(mockDispatch).toHaveBeenCalledWith({
          type: ZOOM_IN_ROW,
          payload: {
            objectId: cellValue,
          },
        });
      });

      describe("composed PK", () => {
        const question = ORDERS.question();
        const orderTotalField = question
          .query()
          .table()
          .fields.find(field => field.id === ORDERS.TOTAL.id);
        orderTotalField.semantic_type = "type/PK";

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
          const card = action.question().card();
          expect(card.dataset_query.query).toEqual({
            "source-table": ORDERS.id,
            filter: ["=", ORDERS.ID.reference(), cellValue],
          });
        });

        orderTotalField.semantic_type = null;
      });
    });

    describe("from dashboard", () => {
      describe("without parameters", () => {
        const { actions, cellValue } = setup({
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
              url: expect.any(Function),
            },
          ]);
        });

        it("should return correct URL to object detail", () => {
          const [action] = actions;
          expect(action.url()).toBe(
            `/question/${SAVED_QUESTION.id()}-${SAVED_QUESTION.displayName()}/${cellValue}`,
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
        expect(action.extra()).toEqual({ objectId: cellValue });
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
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": PRODUCTS.id,
          filter: ["=", PRODUCTS.ID.reference(), cellValue],
        });
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
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": PRODUCTS.id,
          filter: ["=", PRODUCTS.ID.reference(), cellValue],
        });
      });
    });
  });
});
