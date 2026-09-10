import { utf8_to_b64 } from "metabase/utils/encoding";

import { getMcpDeserializedQuery } from "./McpUiAppRoute.utils";

const NATIVE_QUERY = {
  database: 26,
  type: "native",
  native: {
    query: "SELECT * FROM orders WHERE category = {{cat}}",
    "template-tags": {
      cat: { id: "abc-123", name: "cat", "display-name": "Cat", type: "text" },
    },
  },
};

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
        parameters: [
          {
            type: "category",
            value: "Gizmo",
            target: ["variable", ["template-tag", "cat"]],
          },
        ],
      }),
    );

    expect(getMcpDeserializedQuery(query)?.initialSqlParameters).toEqual({
      cat: "Gizmo",
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
        parameters: [
          {
            type: "category",
            value: "Gizmo",
            target: ["variable", ["template-tag", "cat"]],
          },
        ],
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
});
