import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const orderCreatedAt = metadata.field(ORDERS.CREATED_AT);
const productCreatedAt = metadata.field(PRODUCTS.CREATED_AT);

function getOrdersJoinQuery({
  alias = "Products",
  condition,
  sourceTable = PRODUCTS_ID,
} = {}) {
  return ordersTable.query().join({
    alias,
    condition,
    "source-table": sourceTable,
  });
}

function getJoin({ query = getOrdersJoinQuery() } = {}) {
  return query.joins()[0];
}

function getDateFieldRef(field, { temporalUnit = "month", joinAlias } = {}) {
  const opts = { "temporal-unit": temporalUnit };
  if (joinAlias) {
    opts["join-alias"] = joinAlias;
  }
  return ["field", field.id, opts];
}

const ORDERS_PRODUCT_ID_FIELD_REF = ["field", ORDERS.PRODUCT_ID, null];

const ORDERS_CREATED_AT_FIELD_REF = getDateFieldRef(orderCreatedAt);

const PRODUCTS_ID_FIELD_REF = ["field", PRODUCTS.ID, null];

const PRODUCTS_CREATED_AT_FIELD_REF = getDateFieldRef(productCreatedAt);

const PRODUCTS_ID_JOIN_FIELD_REF = [
  "field",
  PRODUCTS.ID,
  { "join-alias": "Products" },
];

const PRODUCTS_CREATED_AT_JOIN_FIELD_REF = getDateFieldRef(productCreatedAt, {
  joinAlias: "Products",
});

const ORDERS_PRODUCT_JOIN_CONDITION = [
  "=",
  ORDERS_PRODUCT_ID_FIELD_REF,
  PRODUCTS_ID_JOIN_FIELD_REF,
];

const ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT = [
  "=",
  ORDERS_CREATED_AT_FIELD_REF,
  PRODUCTS_CREATED_AT_JOIN_FIELD_REF,
];

const ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION = [
  "and",
  ORDERS_PRODUCT_JOIN_CONDITION,
  ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT,
];

describe("Join", () => {
  describe("setDefaultCondition", () => {
    it("should set default condition to be fk relationship", () => {
      let join = getJoin();

      join = join.setDefaultCondition();

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });
  });

  describe("setParentDimension", () => {
    it("creates a condition if not present", () => {
      let join = getJoin();

      join = join.setParentDimension({
        dimension: ORDERS_PRODUCT_ID_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ["=", ORDERS_PRODUCT_ID_FIELD_REF, null],
        "source-table": PRODUCTS_ID,
      });
    });

    it("sets a dimension for existing condition", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ["=", null, PRODUCTS_ID_JOIN_FIELD_REF],
        }),
      });

      join = join.setParentDimension({
        dimension: ORDERS_PRODUCT_ID_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("removes the dimensions", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });

      join = join.setParentDimension({
        dimension: null,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ["=", null, PRODUCTS_ID_JOIN_FIELD_REF],
        "source-table": PRODUCTS_ID,
      });
    });

    it("sets a dimension for multi-dimension condition by index", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: [
            "and",
            ORDERS_PRODUCT_JOIN_CONDITION,
            ["=", null, PRODUCTS_CREATED_AT_JOIN_FIELD_REF],
          ],
        }),
      });

      join = join.setParentDimension({
        index: 1,
        dimension: ORDERS_CREATED_AT_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("turns into multi-dimension join if not existing condition index provided", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });

      join = join.setParentDimension({
        index: 1,
        dimension: ORDERS_CREATED_AT_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          "and",
          ORDERS_PRODUCT_JOIN_CONDITION,
          ["=", ORDERS_CREATED_AT_FIELD_REF, null],
        ],
        "source-table": PRODUCTS_ID,
      });
    });

    it("inherits join dimension's temporal unit", () => {
      const joinDimension = getDateFieldRef(productCreatedAt, {
        joinAlias: "Products",
        temporalUnit: "day",
      });
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ["=", null, joinDimension],
        }),
      });

      join = join.setParentDimension({
        dimension: ORDERS_CREATED_AT_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          "=",
          getDateFieldRef(orderCreatedAt, { temporalUnit: "day" }),
          joinDimension,
        ],
        "source-table": PRODUCTS_ID,
      });
    });

    it("overwrites join dimension's temporal unit if flag provided", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ["=", null, PRODUCTS_CREATED_AT_JOIN_FIELD_REF],
        }),
      });

      join = join.setParentDimension({
        dimension: getDateFieldRef(orderCreatedAt, { temporalUnit: "week" }),
        overwriteTemporalUnit: true,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          "=",
          getDateFieldRef(orderCreatedAt, { temporalUnit: "week" }),
          getDateFieldRef(productCreatedAt, {
            joinAlias: "Products",
            temporalUnit: "week",
          }),
        ],
        "source-table": PRODUCTS_ID,
      });
    });

    it("preserves operator when changes a dimension", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: [">=", null, PRODUCTS_ID_JOIN_FIELD_REF],
        }),
      });

      join = join.setParentDimension({
        dimension: ORDERS_PRODUCT_ID_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          ">=",
          ORDERS_PRODUCT_ID_FIELD_REF,
          PRODUCTS_ID_JOIN_FIELD_REF,
        ],
        "source-table": PRODUCTS_ID,
      });
    });
  });

  describe("setJoinDimension", () => {
    it("creates a condition if not present", () => {
      let join = getJoin();

      join = join.setJoinDimension({
        dimension: PRODUCTS_ID_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ["=", null, PRODUCTS_ID_FIELD_REF],
        "source-table": PRODUCTS_ID,
      });
    });

    it("sets a dimension for existing condition", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ["=", ORDERS_PRODUCT_ID_FIELD_REF, null],
        }),
      });

      join = join.setJoinDimension({
        dimension: PRODUCTS_ID_JOIN_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("removes the dimensions", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });

      join = join.setJoinDimension({
        dimension: null,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ["=", ORDERS_PRODUCT_ID_FIELD_REF, null],
        "source-table": PRODUCTS_ID,
      });
    });

    it("sets a dimension for multi-dimension condition by index", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: [
            "and",
            ORDERS_PRODUCT_JOIN_CONDITION,
            ["=", ORDERS_CREATED_AT_FIELD_REF, null],
          ],
        }),
      });

      join = join.setJoinDimension({
        index: 1,
        dimension: PRODUCTS_CREATED_AT_JOIN_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("turns into multi-dimension join if not existing condition index provided", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });

      join = join.setJoinDimension({
        index: 1,
        dimension: PRODUCTS_CREATED_AT_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          "and",
          ORDERS_PRODUCT_JOIN_CONDITION,
          ["=", null, PRODUCTS_CREATED_AT_FIELD_REF],
        ],
        "source-table": PRODUCTS_ID,
      });
    });

    it("inherits parent dimension's temporal unit", () => {
      const parentDimension = getDateFieldRef(orderCreatedAt, {
        temporalUnit: "day",
      });
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ["=", parentDimension, null],
        }),
      });

      join = join.setJoinDimension({
        dimension: PRODUCTS_CREATED_AT_JOIN_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          "=",
          parentDimension,
          getDateFieldRef(productCreatedAt, {
            temporalUnit: "day",
            joinAlias: "Products",
          }),
        ],
        "source-table": PRODUCTS_ID,
      });
    });

    it("overwrites parent dimension's temporal unit if flag provided", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ["=", ORDERS_CREATED_AT_FIELD_REF, null],
        }),
      });

      join = join.setJoinDimension({
        dimension: getDateFieldRef(productCreatedAt, {
          temporalUnit: "week",
          joinAlias: "Products",
        }),
        overwriteTemporalUnit: true,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          "=",
          getDateFieldRef(orderCreatedAt, { temporalUnit: "week" }),
          getDateFieldRef(productCreatedAt, {
            temporalUnit: "week",
            joinAlias: "Products",
          }),
        ],
        "source-table": PRODUCTS_ID,
      });
    });

    it("preserves operator when changes a dimension", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: [">=", PRODUCTS_ID_JOIN_FIELD_REF, null],
        }),
      });

      join = join.setJoinDimension({
        dimension: ORDERS_PRODUCT_ID_FIELD_REF,
      });

      expect(join).toEqual({
        alias: "Products",
        condition: [
          ">=",
          PRODUCTS_ID_JOIN_FIELD_REF,
          ORDERS_PRODUCT_ID_FIELD_REF,
        ],
        "source-table": PRODUCTS_ID,
      });
    });
  });

  describe("getConditions", () => {
    it("should return empty array for a join without condition", () => {
      const join = getJoin();
      expect(join.getConditions()).toEqual([]);
    });

    it("should return condition for one-fields pair join", () => {
      const join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });
      expect(join.getConditions()).toEqual([ORDERS_PRODUCT_JOIN_CONDITION]);
    });

    it("should return condition for multi-fields join", () => {
      const join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        }),
      });
      expect(join.getConditions()).toEqual([
        ORDERS_PRODUCT_JOIN_CONDITION,
        ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT,
      ]);
    });
  });

  describe("setOperator", () => {
    it("changes the operator without fields selected", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({}),
      });

      join = join.setOperator(0, "!=");

      expect(join.getConditions()).toEqual([["!=", null, null]]);
    });

    it("changes the operator of a single condition join", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });

      join = join.setOperator(0, "!=");

      expect(join.getConditions()).toEqual([
        [
          "!=",
          ORDERS_PRODUCT_JOIN_CONDITION[1],
          ORDERS_PRODUCT_JOIN_CONDITION[2],
        ],
      ]);
    });

    it("changes the operator of a multiple conditions join", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        }),
      });

      join = join.setOperator(1, "!=");

      expect(join.getConditions()).toEqual([
        ORDERS_PRODUCT_JOIN_CONDITION,
        [
          "!=",
          ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT[1],
          ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT[2],
        ],
      ]);
    });
  });

  describe("removeCondition", () => {
    it("does nothing when there is no condition", () => {
      let join = getJoin();

      join = join.removeCondition(0);

      expect(join).toEqual({
        alias: "Products",
        condition: undefined,
        "source-table": PRODUCTS_ID,
      });
    });

    it("removes condition for single fields pair join by index", () => {
      let join = getJoin();

      join = join.removeCondition(0);

      expect(join).toEqual({
        alias: "Products",
        condition: undefined,
        "source-table": PRODUCTS_ID,
      });
    });

    it("does nothing if condition index is out of range for single fields pair join", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_JOIN_CONDITION,
        }),
      });

      join = join.removeCondition(100);

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("removes condition from multi-fields join by index", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: [
            ...ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
            ["=", ["field", ORDERS.TAX, null], ["field", PRODUCTS.PRICE, null]],
          ],
        }),
      });

      join = join.removeCondition(2);

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("turns multi-fields join condition into single pair when only one condition is left", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        }),
      });

      join = join.removeCondition(1);

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });

    it("does nothing if condition index is out of range for multi-fields join", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        }),
      });

      join = join.removeCondition(100);

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION,
        "source-table": PRODUCTS_ID,
      });
    });
  });
});
