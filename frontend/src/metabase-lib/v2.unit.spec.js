import Query from "metabase-lib/v2";

import {
  field,
  to_js
} from "cljs/metabase.lib.core";

const nestedQuestionCard = {
  table_id: null,
  result_metadata: [
    {
      name: "boolean",
      display_name: "boolean",
      base_type: "type/Boolean",
      effective_type: "type/Boolean",
      semantic_type: null,
      field_ref: [
        "field",
        "boolean",
        {
          "base-type": "type/Boolean",
        },
      ],
    },
    {
      base_type: "type/Text",
      display_name: "Foo",
      effective_type: "type/Text",
      field_ref: ["expression", "Foo"],
      id: ["field", "Foo", { "base-type": "type/Text" }],
      name: "Foo",
      semantic_type: null,
      table_id: "card__61",
    },
  ],
  database_id: 1,
  query_type: "query",
  name: "nested question",
  dataset_query: {
    database: 1,
    query: {
      "source-table": "card__61",
    },
    type: "query",
  },
  id: 62,
  display: "table",
};

describe("something", () => {
  it("is amazing", () => {
    let query = Query.fromSavedQuestion(nestedQuestionCard)
                     .orderBy(field("Foo"));



    expect(to_js(query.orderBys())).toBe(null);
  })
})
