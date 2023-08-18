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
});
