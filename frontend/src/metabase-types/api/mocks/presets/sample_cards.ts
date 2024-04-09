import type {
  Card,
  NativeDatasetQuery,
  StructuredDatasetQuery,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockStructuredCard,
  createMockNativeCard,
} from "metabase-types/api/mocks";

import { ORDERS_ID, SAMPLE_DB_ID } from "./sample_database";

type StructuredCard = Card<StructuredDatasetQuery>;
type StructuredUnsavedCard = UnsavedCard<StructuredDatasetQuery>;
type NativeCard = Card<NativeDatasetQuery>;
type NativeUnsavedCard = UnsavedCard<NativeDatasetQuery>;

export const createAdHocCard = (
  opts?: Partial<StructuredUnsavedCard>,
): StructuredUnsavedCard => ({
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
  opts?: Partial<NativeUnsavedCard>,
): NativeUnsavedCard => ({
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
  opts?: Partial<NativeUnsavedCard>,
): NativeUnsavedCard => ({
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

export const createSavedStructuredCard = (
  opts?: Partial<StructuredCard>,
): StructuredCard => {
  return createMockStructuredCard({
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

export const createSavedNativeCard = (
  opts?: Partial<NativeCard>,
): NativeCard => {
  return createMockNativeCard({
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

export const createStructuredModelCard = (
  opts?: Partial<StructuredCard>,
): StructuredCard => {
  return createSavedStructuredCard({
    type: "model",
    ...opts,
  });
};

export const createNativeModelCard = (
  opts?: Partial<NativeCard>,
): NativeCard => {
  return createSavedNativeCard({
    type: "model",
    ...opts,
  });
};

export const createComposedModelCard = ({
  id = 1,
  ...opts
}: Partial<StructuredCard> = {}): StructuredCard => {
  return createStructuredModelCard({
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": `card__${id}`,
      },
    },
    ...opts,
    id,
  });
};
