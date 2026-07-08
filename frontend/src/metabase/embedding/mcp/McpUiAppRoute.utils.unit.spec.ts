import { utf8_to_b64 } from "metabase/utils/encoding";

import { getMcpDeserializedCard } from "./McpUiAppRoute.utils";

describe("getMcpDeserializedCard", () => {
  it("hides axis labels for MCP App ad-hoc charts", () => {
    const datasetQuery = { database: 1, type: "query", query: {} };
    const query = utf8_to_b64(JSON.stringify(datasetQuery));

    expect(getMcpDeserializedCard(query)).toEqual(
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

  it("returns null for invalid query params", () => {
    expect(getMcpDeserializedCard("not-json")).toBeNull();
  });
});
