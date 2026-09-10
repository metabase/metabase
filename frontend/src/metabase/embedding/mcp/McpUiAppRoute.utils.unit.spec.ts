import { createMockMetadata } from "__support__/metadata";
import { getParameterValuesForQuestion } from "metabase/query_builder";
import { utf8_to_b64 } from "metabase/utils/encoding";
import Question from "metabase-lib/v1/Question";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

import { getMcpDeserializedQuery } from "./McpUiAppRoute.utils";

// The exact payload `execute_sql` mints, captured from `lib/prepare-for-serialization` in the REPL:
// MBQL 5 (`stages`, not a legacy `dataset_query`), `template-tags` as an array rather than a map,
// and `parameters` re-attached at the top level because serialization strips them from the query.
const NATIVE_QUERY = {
  "lib/type": "mbql/query",
  stages: [
    {
      "lib/type": "mbql.stage/native",
      "template-tags": [
        {
          type: "text",
          name: "cat",
          id: "1f8cda0e-e8ae-4d63-ae5c-896d3bf4bc59",
          "display-name": "Cat",
        },
      ],
      native: "SELECT {{cat}} AS cat",
    },
  ],
  database: 29001,
};

const BOUND_PARAMETERS = [
  {
    type: "text",
    target: ["variable", ["template-tag", "cat"]],
    value: "meow",
  },
];

describe("getMcpDeserializedQuery", () => {
  it("hides axis labels for MCP App ad-hoc charts", () => {
    const datasetQuery = { database: 1, type: "query", query: {} };
    const query = utf8_to_b64(JSON.stringify(datasetQuery));

    expect(getMcpDeserializedQuery(query)?.card).toEqual(
      expect.objectContaining({
        display: "table",
        dataset_query: datasetQuery,
        visualization_settings: {
          "graph.x_axis.labels_enabled": false,
          "graph.y_axis.labels_enabled": false,
        },
      }),
    );
  });

  it("returns bound template-tag values keyed by tag name", () => {
    const query = utf8_to_b64(
      JSON.stringify({
        ...NATIVE_QUERY,
        parameters: BOUND_PARAMETERS,
      }),
    );

    expect(getMcpDeserializedQuery(query)?.initialSqlParameters).toEqual({
      cat: "meow",
    });
  });

  it("keeps parameters out of dataset_query", () => {
    // `execute_sql` re-attaches `:parameters` to the serialized query, so a handle is wider than a
    // dataset query. Leaving them nested there loses the values twice over: the card's own
    // parameters win when the run payload is assembled, and nothing reads a `parameters` key inside
    // `dataset_query` — so the native query would run with `{{cat}}` unbound.
    const query = utf8_to_b64(
      JSON.stringify({
        ...NATIVE_QUERY,
        parameters: BOUND_PARAMETERS,
      }),
    );

    expect(getMcpDeserializedQuery(query)?.card.dataset_query).toEqual(
      NATIVE_QUERY,
    );
  });

  it("returns no template-tag values for a query that carries none", () => {
    const datasetQuery = { database: 1, type: "query", query: {} };
    const query = utf8_to_b64(JSON.stringify(datasetQuery));

    expect(getMcpDeserializedQuery(query)?.initialSqlParameters).toEqual({});
  });

  it("skips parameters that do not target a template tag", () => {
    const query = utf8_to_b64(
      JSON.stringify({
        ...NATIVE_QUERY,
        parameters: [{ type: "category", value: "Gizmo", target: null }],
      }),
    );

    expect(getMcpDeserializedQuery(query)?.initialSqlParameters).toEqual({});
  });

  it("returns null for invalid query params", () => {
    expect(getMcpDeserializedQuery("not-json")).toBeNull();
  });

  // The load-bearing one. The two above only prove the payload was split; this proves the split
  // halves rejoin, by driving the same helpers `loadQuestionSdk` uses: the card's own parameters
  // are derived from its template tags, and `initialSqlParameters` is matched against them by slug.
  // If the value doesn't land here, the embed runs `{{cat}}` unbound no matter how clean the split.
  it("binds the value to the card's template-tag parameter", () => {
    const deserialized = getMcpDeserializedQuery(
      utf8_to_b64(
        JSON.stringify({ ...NATIVE_QUERY, parameters: BOUND_PARAMETERS }),
      ),
    );
    const card = deserialized!.card;
    const metadata = createMockMetadata({});

    const uiParameters = getCardUiParameters(card, metadata);
    expect(uiParameters.map((parameter) => parameter.slug)).toEqual(["cat"]);

    const parameterValues = getParameterValuesForQuestion({
      card,
      metadata,
      queryParams: deserialized!.initialSqlParameters,
    });
    // Array-wrapped by widget normalization: `normalizeParameterValue` wraps every string- and
    // number-typed parameter the same way on the path to the request, so this is the shape a
    // filter widget produces too, not an MCP quirk.
    expect(Object.values(parameterValues)).toEqual([["meow"]]);
  });

  // The whole chain, mirroring `loadQuestionSdk`: build the question from the card, apply template
  // tag parameters, derive values from `initialSqlParameters`, set them, then assemble the request
  // parameters exactly as `runQuestionQuery` does. This is the payload the QP receives — if the
  // bound value is missing here, the embed reports `missing required parameters`.
  it("sends the bound value in the request parameters", () => {
    const deserialized = getMcpDeserializedQuery(
      utf8_to_b64(
        JSON.stringify({ ...NATIVE_QUERY, parameters: BOUND_PARAMETERS }),
      ),
    );
    const card = deserialized!.card;
    const metadata = createMockMetadata({});

    let question = new Question(card, metadata).applyTemplateTagParameters();
    question = question.setParameterValues(
      getParameterValuesForQuestion({
        card,
        metadata,
        queryParams: deserialized!.initialSqlParameters,
      }),
    );

    const requestParameters = normalizeParameters(question.parameters());
    expect(requestParameters).toEqual([
      expect.objectContaining({
        value: ["meow"],
        target: ["variable", ["template-tag", "cat"]],
      }),
    ]);
  });
});
