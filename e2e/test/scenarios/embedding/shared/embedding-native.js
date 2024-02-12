import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

const query = `
SELECT orders.id, orders.product_id, orders.created_at AS production_date, orders.total, people.state, people.name, people.source
FROM orders LEFT JOIN people ON orders.user_id = people.id
WHERE true
  [[AND {{id}}]]
  [[AND orders.product_id = {{product_id}}]]
  [[AND {{created_at}}]]
  [[AND {{total}}]]
  [[AND {{state}}]]
  AND [[people.source = {{source}} --]] people.source IN ('Affiliate', 'Organic')
  LIMIT 15;
`;

export const questionDetails = {
  name: "Native Question With Multiple Filters - Embedding Test",
  description: "FooBar",
  native: {
    "template-tags": {
      id: {
        id: "d404e93f-8155-e990-ff57-37122547406c",
        name: "id",
        "display-name": "Order ID",
        type: "dimension",
        dimension: ["field", ORDERS.ID, null],
        "widget-type": "id",
        default: null,
      },
      created_at: {
        id: "a21ca6d2-f742-a94a-da71-75adf379069c",
        name: "created_at",
        "display-name": "Created At",
        type: "dimension",
        dimension: ["field", ORDERS.CREATED_AT, null],
        "widget-type": "date/quarter-year",
        default: null,
      },
      total: {
        id: "68350949-02cc-f540-86cf-ddcda07529d8",
        name: "total",
        "display-name": "Total",
        type: "dimension",
        dimension: ["field", ORDERS.TOTAL, null],
        "widget-type": "number/>=",
        default: [0],
      },
      source: {
        id: "44038e73-f909-1bed-0974-2a42ce8979e8",
        name: "source",
        "display-name": "Source",
        type: "text",
      },
      state: {
        id: "88057a9e-91bd-4b2e-9327-afd92c259dc8",
        name: "state",
        "display-name": "State",
        type: "dimension",
        dimension: ["field", PEOPLE.STATE, null],
        "widget-type": "string/!=",
        default: null,
      },
      product_id: {
        id: "c967d72e-3687-aa01-8c47-458f7905305f",
        name: "product_id",
        "display-name": "Product ID",
        type: "number",
        default: null,
      },
    },
    query,
    type: "native",
  },
};
