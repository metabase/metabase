/* eslint-disable flowtype/require-valid-file-annotation */

import { TYPE } from "metabase/lib/types";

const FLOAT_FIELD = {
  id: 1,
  display_name: "Mock Float Field",
  base_type: TYPE.Float,
};

const CATEGORY_FIELD = {
  id: 2,
  display_name: "Mock Category Field",
  base_type: TYPE.Text,
  special_type: TYPE.Category,
};

const DATE_FIELD = {
  id: 3,
  display_name: "Mock Date Field",
  base_type: TYPE.DateTime,
};

const PK_FIELD = {
  id: 4,
  display_name: "Mock PK Field",
  base_type: TYPE.Integer,
  special_type: TYPE.PK,
};

const foreignTableMetadata = {
  id: 20,
  db_id: 100,
  display_name: "Mock Foreign Table",
  fields: [],
};

const FK_FIELD = {
  id: 5,
  display_name: "Mock FK Field",
  base_type: TYPE.Integer,
  special_type: TYPE.FK,
  target: {
    id: 25,
    table_id: foreignTableMetadata.id,
    table: foreignTableMetadata,
  },
};

export const tableMetadata = {
  id: 10,
  db_id: 100,
  display_name: "Mock Table",
  fields: [FLOAT_FIELD, CATEGORY_FIELD, DATE_FIELD, PK_FIELD, FK_FIELD],
};

export const card = {
  dataset_query: {
    type: "query",
    query: {
      "source-table": 10,
    },
  },
};

export const nativeCard = {
  dataset_query: {
    type: "native",
    native: {
      query: "SELECT count(*) from ORDERS",
    },
  },
};

export const savedCard = {
  id: 1,
  dataset_query: {
    type: "query",
    query: {
      "source-table": 10,
    },
  },
};
export const savedNativeCard = {
  id: 2,
  dataset_query: {
    type: "native",
    native: {
      query: "SELECT count(*) from ORDERS",
    },
  },
};

export const clickedFloatHeader = {
  column: {
    ...FLOAT_FIELD,
    source: "fields",
  },
};

export const clickedCategoryHeader = {
  column: {
    ...CATEGORY_FIELD,
    source: "fields",
  },
};

export const clickedFloatValue = {
  column: {
    ...CATEGORY_FIELD,
    source: "fields",
  },
  value: 1234,
};

export const clickedPKValue = {
  column: {
    ...PK_FIELD,
    source: "fields",
  },
  value: 42,
};

export const clickedFKValue = {
  column: {
    ...FK_FIELD,
    source: "fields",
  },
  value: 43,
};
