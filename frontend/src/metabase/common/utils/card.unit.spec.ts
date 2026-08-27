import {
  deserializeCardFromQuery,
  getMetricSeriesWithDefaultDisplay,
} from "metabase/common/utils/card";
import { utf8_to_b64url } from "metabase/utils/encoding";
import * as Lib from "metabase-lib";
import { SAMPLE_METADATA, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockCard,
  createMockDataset,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

describe("deserializeCardFromQuery", () => {
  const MBQL_QUERY = {
    database: 1,
    type: "query",
    query: { "source-table": 2 },
  };
  const CARD_PAYLOAD = {
    dataset_query: MBQL_QUERY,
    display: "bar",
    visualization_settings: {},
  };
  const WRAPPED_B64 = utf8_to_b64url(JSON.stringify(CARD_PAYLOAD));

  it("should strip /question# prefix and decode the payload", () => {
    expect(deserializeCardFromQuery(`/question#${WRAPPED_B64}`)).toEqual(
      CARD_PAYLOAD,
    );
  });
});

describe("getMetricSeriesWithDefaultDisplay", () => {
  function createMetricSeries(query: Lib.Query) {
    return createMockSingleSeries(
      createMockCard({ type: "metric", display: "line" }),
      createMockDataset({ json_query: Lib.toJsQuery(query) }),
    );
  }

  it("uses a bar chart for a metric with a binned numeric breakout", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "TOTAL",
              sourceName: "ORDERS",
              bins: 10,
            },
          ],
        },
      ],
    });

    const result = getMetricSeriesWithDefaultDisplay(
      [createMetricSeries(query)],
      SAMPLE_METADATA,
    );

    expect(result[0].card.display).toBe("bar");
  });

  it("uses a line chart for a metric with a temporal breakout", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", sourceName: "ORDERS" },
          ],
        },
      ],
    });

    const result = getMetricSeriesWithDefaultDisplay(
      [createMetricSeries(query)],
      SAMPLE_METADATA,
    );

    expect(result[0].card.display).toBe("line");
  });

  it("preserves the display of regular questions", () => {
    const series = [
      createMockSingleSeries(
        createMockCard({ type: "question", display: "line" }),
        createMockDataset(),
      ),
    ];

    expect(getMetricSeriesWithDefaultDisplay(series, SAMPLE_METADATA)).toBe(
      series,
    );
  });
});
