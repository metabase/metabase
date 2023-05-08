import { Card, UnsavedCard } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "./sample_database";

export const createAdHocCard = (opts?: Partial<UnsavedCard>): UnsavedCard => ({
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
  ...opts,
});

export const createAdHocNativeCard = (
  opts?: Partial<UnsavedCard>,
): UnsavedCard => ({
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DB_ID,
    native: {
      query: "select * from orders",
      "template-tags": {},
    },
  },
  ...opts,
});

export const createEmptyAdHocNativeCard = (
  opts?: Partial<UnsavedCard>,
): UnsavedCard => ({
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DB_ID,
    native: {
      query: "",
      "template-tags": {},
    },
  },
  ...opts,
});

export const createSavedStructuredCard = (opts?: Partial<Card>): Card => {
  return createMockCard({
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
      },
    },
    ...opts,
  });
};

export const createSavedNativeCard = (opts?: Partial<Card>): Card => {
  return createMockCard({
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "native",
      database: SAMPLE_DB_ID,
      native: {
        query: "select * from orders",
        "template-tags": {},
      },
    },
    ...opts,
  });
};

export const createStructuredModelCard = (opts?: Partial<Card>): Card => {
  return createSavedStructuredCard({
    dataset: true,
    ...opts,
  });
};

export const createNativeModelCard = (opts?: Partial<Card>): Card => {
  return createSavedNativeCard({
    dataset: true,
    ...opts,
  });
};

export const createComposedModelCard = (opts?: Partial<Card>): Card => {
  return createStructuredModelCard({
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": `card__${ORDERS_ID}`,
      },
    },
    ...opts,
  });
};
