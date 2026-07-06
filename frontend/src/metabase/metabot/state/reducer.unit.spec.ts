import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { insertPastedChart, markChartSaved } from "./actions";
import { metabotReducer } from "./reducer";
import { getMetabotInitialState } from "./reducer-utils";

const datasetQuery = createMockStructuredDatasetQuery();

describe("metabot reducer", () => {
  describe("insertPastedChart", () => {
    it("merges a pasted chart and its query into the conversation state", () => {
      const next = metabotReducer(
        getMetabotInitialState(),
        insertPastedChart({
          agentId: "omnibot",
          chartId: "chart-1",
          queryId: "query-1",
          query: datasetQuery,
          display: "bar",
        }),
      );

      const state = next.conversations.omnibot?.state;
      expect(state?.queries["query-1"]).toEqual(datasetQuery);
      expect(state?.charts["chart-1"]).toEqual({
        chart_id: "chart-1",
        query_id: "query-1",
        queries: [datasetQuery],
        visualization_settings: { chart_type: "bar" },
      });
    });

    it("keeps previously stored charts when inserting another", () => {
      const first = metabotReducer(
        getMetabotInitialState(),
        insertPastedChart({
          agentId: "omnibot",
          chartId: "chart-1",
          queryId: "query-1",
          query: datasetQuery,
          display: "bar",
        }),
      );
      const next = metabotReducer(
        first,
        insertPastedChart({
          agentId: "omnibot",
          chartId: "chart-2",
          queryId: "query-2",
          query: datasetQuery,
          display: "line",
        }),
      );

      const state = next.conversations.omnibot?.state;
      expect(Object.keys(state?.charts ?? {})).toEqual(["chart-1", "chart-2"]);
      expect(Object.keys(state?.queries ?? {})).toEqual(["query-1", "query-2"]);
    });
  });

  describe("markChartSaved", () => {
    const location = {
      type: "collection" as const,
      id: 5,
      name: "Sales analytics",
      url: "/collection/5",
    };

    it("records the saved card + location in the conversation state", () => {
      const next = metabotReducer(
        getMetabotInitialState(),
        markChartSaved({
          agentId: "omnibot",
          entityId: "chart-1",
          cardId: 99,
          location,
        }),
      );

      expect(next.conversations.omnibot?.state?.savedCharts["chart-1"]).toEqual(
        {
          card_id: 99,
          location,
        },
      );
    });

    it("stores just the card id for a manual save with no location", () => {
      const next = metabotReducer(
        getMetabotInitialState(),
        markChartSaved({ agentId: "omnibot", entityId: "chart-1", cardId: 42 }),
      );

      expect(next.conversations.omnibot?.state?.savedCharts["chart-1"]).toEqual(
        {
          card_id: 42,
        },
      );
    });
  });
});
