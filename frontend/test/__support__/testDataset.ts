import type { DatasetColumn, DatasetData } from "metabase-types/api";
import { createMockDatasetData } from "metabase-types/api/mocks";
import { PRODUCTS_ID, PRODUCTS } from "metabase-types/api/mocks/presets";

const testColumns: DatasetColumn[] = [
  {
    description:
      "The numerical product number. Only used internally. All external communication should use the title or EAN.",
    semantic_type: "type/PK",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "ID",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.TITLE, null],
    effective_type: "type/BigInteger",

    id: PRODUCTS.TITLE,
    visibility_type: "normal",
    display_name: "ID",
    fingerprint: null,
    base_type: "type/BigInteger",
  },
  {
    description:
      "The international article number. A 13 digit number uniquely identifying the product.",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "EAN",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.EAN, null],
    effective_type: "type/Text",

    id: PRODUCTS.EAN,
    visibility_type: "normal",
    display_name: "Ean",
    fingerprint: {
      global: {
        "distinct-count": 200,
        "nil%": 0,
      },
      type: {
        "type/Text": {
          "percent-json": 0,
          "percent-url": 0,
          "percent-email": 0,
          "percent-state": 0,
          "average-length": 13,
        },
      },
    },
    base_type: "type/Text",
  },
  {
    description:
      "The name of the product as it should be displayed to customers.",
    semantic_type: "type/Title",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "TITLE",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.TITLE, null],
    effective_type: "type/Text",

    id: PRODUCTS.TITLE,
    visibility_type: "normal",
    display_name: "Title",
    fingerprint: {
      global: {
        "distinct-count": 199,
        "nil%": 0,
      },
      type: {
        "type/Text": {
          "percent-json": 0,
          "percent-url": 0,
          "percent-email": 0,
          "percent-state": 0,
          "average-length": 21.495,
        },
      },
    },
    base_type: "type/Text",
  },
  {
    description:
      "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget",
    semantic_type: "type/Category",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "CATEGORY",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.CATEGORY, null],
    effective_type: "type/Text",

    id: PRODUCTS.CATEGORY,
    visibility_type: "normal",
    display_name: "Category",
    fingerprint: {
      global: {
        "distinct-count": 4,
        "nil%": 0,
      },
      type: {
        "type/Text": {
          "percent-json": 0,
          "percent-url": 0,
          "percent-email": 0,
          "percent-state": 0,
          "average-length": 6.375,
        },
      },
    },
    base_type: "type/Text",
  },
  {
    description: "The source of the product.",
    semantic_type: "type/Company",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "VENDOR",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.VENDOR, null],
    effective_type: "type/Text",

    id: PRODUCTS.VENDOR,
    visibility_type: "normal",
    display_name: "Vendor",
    fingerprint: {
      global: {
        "distinct-count": 200,
        "nil%": 0,
      },
      type: {
        "type/Text": {
          "percent-json": 0,
          "percent-url": 0,
          "percent-email": 0,
          "percent-state": 0,
          "average-length": 20.6,
        },
      },
    },
    base_type: "type/Text",
  },
  {
    description:
      "The list price of the product. Note that this is not always the price the product sold for due to discounts, promotions, etc.",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "PRICE",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.PRICE, null],
    effective_type: "type/Float",

    id: PRODUCTS.PRICE,
    visibility_type: "normal",
    display_name: "Price",
    fingerprint: {
      global: {
        "distinct-count": 170,
        "nil%": 0,
      },
      type: {
        "type/Number": {
          min: 15.691943673970439,
          q1: 37.25154462926434,
          q3: 75.45898071609447,
          max: 98.81933684368194,
          sd: 21.711481557852057,
          avg: 55.74639966792074,
        },
      },
    },
    base_type: "type/Float",
  },
  {
    description:
      "The average rating users have given the product. This ranges from 1 - 5",
    semantic_type: "type/Score",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    name: "RATING",
    settings: {},
    source: "fields",
    field_ref: ["field", PRODUCTS.RATING, null],
    effective_type: "type/Float",

    id: PRODUCTS.RATING,
    visibility_type: "normal",
    display_name: "Rating",
    fingerprint: {
      global: {
        "distinct-count": 23,
        "nil%": 0,
      },
      type: {
        "type/Number": {
          min: 0,
          q1: 3.5120465053408525,
          q3: 4.216124969497314,
          max: 5,
          sd: 1.3605488657451452,
          avg: 3.4715,
        },
      },
    },
    base_type: "type/Float",
  },
  {
    description: "The date the product was added to our catalog.",
    semantic_type: "type/CreationTimestamp",
    table_id: PRODUCTS_ID,
    coercion_strategy: null,
    unit: "default",
    name: "CREATED_AT",
    settings: {},
    source: "fields",
    field_ref: [
      "field",
      PRODUCTS.CREATED_AT,
      {
        "temporal-unit": "default",
      },
    ],
    effective_type: "type/DateTime",

    id: PRODUCTS.CREATED_AT,
    visibility_type: "normal",
    display_name: "Created At",
    fingerprint: {
      global: {
        "distinct-count": 200,
        "nil%": 0,
      },
      type: {
        "type/DateTime": {
          earliest: "2016-04-26T19:29:55.147Z",
          latest: "2019-04-15T13:34:19.931Z",
        },
      },
    },
    base_type: "type/DateTime",
  },
];

export const testDataset: DatasetData = createMockDatasetData({
  cols: testColumns,
  rows: [
    [
      "1",
      "1018947080336",
      "Rustic Paper Wallet",
      "Gizmo",
      "Swaniawski, Casper and Hilll",
      29.463261130679875,
      4.6,
      "2017-07-19T19:44:56.582-06:00",
    ],
    [
      "2",
      "7663515285824",
      "Small Marble Shoes",
      "Doohickey",
      "Balistreri-Ankunding",
      70.07989613071763,
      0,
      "2019-04-11T08:49:35.932-06:00",
    ],
    [
      "3",
      "4966277046676",
      "Synergistic Granite Chair",
      "Doohickey",
      "Murray, Watsica and Wunsch",
      35.388744881539054,
      4,
      "2018-09-08T22:03:20.239-06:00",
    ],
    [
      "4",
      "4134502155718",
      "Enormous Aluminum Shirt",
      "Doohickey",
      "Regan Bradtke and Sons",
      73.99178100854834,
      3,
      "2018-03-06T02:53:09.937-07:00",
    ],
    [
      "5",
      "5499736705597",
      "Enormous Marble Wallet",
      "Gadget",
      "Price, Schultz and Daniel",
      82.7450976850356,
      4,
      "2016-10-03T01:47:39.147-06:00",
    ],
    [
      "6",
      "2293343551454",
      "Small Marble Hat",
      "Doohickey",
      "Nolan-Wolff",
      64.95747510229587,
      3.8,
      "2017-03-29T05:43:40.15-06:00",
    ],
    [
      "7",
      "0157967025871",
      "Aerodynamic Linen Coat",
      "Doohickey",
      "Little-Pagac",
      98.81933684368194,
      4.3,
      "2017-06-03T03:07:28.061-06:00",
    ],
    [
      "8",
      "1078766578568",
      "Enormous Steel Watch",
      "Doohickey",
      "Senger-Stamm",
      65.89215669329305,
      4.1,
      "2018-04-30T15:03:53.193-06:00",
    ],
    [
      "9",
      "7217466997444",
      "Practical Bronze Computer",
      "Widget",
      "Keely Stehr Group",
      58.31312098526137,
      4.2,
      "2019-02-07T08:26:25.647-07:00",
    ],
    [
      "10",
      "1807963902339",
      "Mediocre Wooden Table",
      "Gizmo",
      "Larson, Pfeffer and Klocko",
      31.78621880685793,
      4.3,
      "2017-01-09T09:51:20.352-07:00",
    ],
  ],
});
