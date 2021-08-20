import { ORDERS, PRODUCTS, REVIEWS } from "__support__/sample_dataset_fixture";
import Join from "metabase-lib/lib/queries/structured/Join";

function getOrdersJoinQuery({
  alias = "Products",
  condition,
  sourceTable = PRODUCTS.id,
} = {}) {
  return ORDERS.query().join({
    alias,
    condition,
    "source-table": sourceTable,
  });
}

function getJoin({ query = getOrdersJoinQuery() } = {}) {
  return query.joins()[0];
}

const ORDERS_PRODUCT_ID_FIELD_REF = ["field", ORDERS.PRODUCT_ID.id, null];

const ORDERS_CREATED_AT_FIELD_REF = ["field", ORDERS.CREATED_AT.id, null];

const PRODUCTS_ID_FIELD_REF = ["field", PRODUCTS.ID.id, null];

const PRODUCTS_CREATED_AT_FIELD_REF = ["field", PRODUCTS.CREATED_AT.id, null];

const PRODUCTS_ID_JOIN_FIELD_REF = [
  "field",
  PRODUCTS.ID.id,
  { "join-alias": "Products" },
];

const ORDERS_PRODUCT_JOIN_CONDITION = [
  "=",
  ORDERS_PRODUCT_ID_FIELD_REF,
  PRODUCTS_ID_JOIN_FIELD_REF,
];

const ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT = [
  "=",
  ORDERS_CREATED_AT_FIELD_REF,
  PRODUCTS_CREATED_AT_FIELD_REF,
];

const ORDERS_PRODUCT_MULTI_FIELD_JOIN_CONDITION = [
  "and",
  ORDERS_PRODUCT_JOIN_CONDITION,
  ORDERS_PRODUCT_JOIN_CONDITION_BY_CREATED_AT,
];

const REVIEWS_PRODUCT_ID_FIELD_REF = [
  "field",
  REVIEWS.PRODUCT_ID.id,
  { "join-alias": "Reviews - Products" },
];

const ORDERS_REVIEWS_JOIN_CONDITION = [
  "=",
  ORDERS_PRODUCT_ID_FIELD_REF,
  REVIEWS_PRODUCT_ID_FIELD_REF,
];

describe("Join", () => {
  describe("setJoinSourceTableId", () => {
    it("should pick an alias based on the source table name by default", () => {
      const query = ORDERS.query();
      const join = new Join({}, 0, query).setJoinSourceTableId(PRODUCTS.id);
      expect(join.alias).toEqual("Products");
    });

    it("should deduplicate aliases", () => {
      const join = new Join({}, 1, getOrdersJoinQuery()).setJoinSourceTableId(
        PRODUCTS.id,
      );
      expect(join.alias).toEqual("Products_2");
    });
  });

  describe("setDefaultCondition", () => {
    it("should set default condition to be fk relationship", () => {
      let join = getJoin();

      join = join.setDefaultCondition();

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS.id,
      });
    });
  });

  describe("setDefaultAlias", () => {
    it("should set default alias to be table + field name and update join condition", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          alias: "x",
          condition: ORDERS_REVIEWS_JOIN_CONDITION,
          sourceTable: REVIEWS.id,
        }),
      });

      join = join.setDefaultCondition().setDefaultAlias();

      expect(join).toEqual({
        alias: "Reviews - Product",
        condition: ORDERS_REVIEWS_JOIN_CONDITION,
        "source-table": REVIEWS.id,
      });
    });

    it("should set default alias to be table name only if it is similar to field name", () => {
      let join = getJoin({ query: getOrdersJoinQuery({ alias: "x" }) });

      join = join.setDefaultCondition().setDefaultAlias();

      expect(join).toEqual({
        alias: "Products",
        condition: ORDERS_PRODUCT_JOIN_CONDITION,
        "source-table": PRODUCTS.id,
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
        "source-table": PRODUCTS.id,
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
        "source-table": PRODUCTS.id,
      });
    });

    it("sets a dimension for multi-dimension condition by index", () => {
      let join = getJoin({
        query: getOrdersJoinQuery({
          condition: [
            "and",
            ORDERS_PRODUCT_JOIN_CONDITION,
            ["=", null, PRODUCTS_CREATED_AT_FIELD_REF],
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
        "source-table": PRODUCTS.id,
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
        "source-table": PRODUCTS.id,
      });
    });
  });
  });
});
