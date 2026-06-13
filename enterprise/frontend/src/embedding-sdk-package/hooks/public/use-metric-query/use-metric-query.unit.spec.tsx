import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { createMockColumn } from "metabase-types/api/mocks";

import type { SchemaRow } from "../data-schema";

import { useMetricQuery } from "./use-metric-query";

const TEST_METRIC_ID = 34;
const TEST_COLUMN = createMockColumn({
  display_name: "Count",
  name: "count",
});
const TEST_RESULT = {
  rowCount: 1,
  runningTime: 1000,
  columns: [TEST_COLUMN],
  rows: [[12]],
};
const TEST_SCHEMA = {
  id: TEST_METRIC_ID,
  name: "Order Count",
  columns: [{ name: "count", displayName: "Count", jsType: "number" }],
  dimensions: {
    price: {
      id: "dimension-price",
      metricId: TEST_METRIC_ID,
      name: "price",
      displayName: "Price",
      jsType: "number",
    },
    createdAt: {
      id: "dimension-created-at",
      metricId: TEST_METRIC_ID,
      name: "createdAt",
      displayName: "Created At",
      jsType: "Date",
    },
  },
} as const;

type Equals<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends <
    TValue,
  >() => TValue extends TRight ? 1 : 2
    ? true
    : false;
type Expect<TValue extends true> = TValue;
type _MetricRowIsInferred = Expect<
  Equals<SchemaRow<typeof TEST_SCHEMA>, { count: number | null }>
>;

describe("useMetricQuery", () => {
  it("builds a metric definition from filters and breakouts", async () => {
    const queryMetricApi = jest.fn().mockResolvedValue({
      ...TEST_RESULT,
    });
    const queryMetric = jest.fn(() => queryMetricApi);

    setup({ queryMetric });

    await waitFor(() => {
      expect(screen.getByTestId("first-row-value")).toHaveTextContent("12");
    });

    expect(queryMetricApi).toHaveBeenCalledWith({
      definition: {
        expression: ["metric", { "lib/uuid": "metric" }, TEST_METRIC_ID],
        filters: [
          {
            "lib/uuid": "metric",
            filter: [">=", {}, ["dimension", {}, "dimension-price"], 2],
          },
        ],
        projections: [
          {
            type: "metric",
            id: TEST_METRIC_ID,
            "lib/uuid": "metric",
            projection: [
              [
                "dimension",
                { "temporal-unit": "month" },
                "dimension-created-at",
              ],
            ],
          },
        ],
      },
    });
    expect(queryMetric).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when disabled", async () => {
    const queryMetric = jest.fn(() => jest.fn());

    setup({ queryMetric, enabled: false });

    expect(screen.getByTestId("first-row-value")).toHaveTextContent("");
    expect(queryMetric).not.toHaveBeenCalled();
  });

  it("can refetch the metric data", async () => {
    const queryMetricApi = jest
      .fn()
      .mockResolvedValueOnce({
        ...TEST_RESULT,
      })
      .mockResolvedValueOnce({
        ...TEST_RESULT,
        rows: [[24]],
      });
    const queryMetric = jest.fn(() => queryMetricApi);

    setup({ queryMetric });

    await waitFor(() => {
      expect(screen.getByTestId("first-row-value")).toHaveTextContent("12");
    });

    await userEvent.click(screen.getByText("Refetch"));

    await waitFor(() => {
      expect(screen.getByTestId("first-row-value")).toHaveTextContent("24");
    });
    expect(queryMetricApi).toHaveBeenCalledTimes(2);
  });
});

const TestComponent = ({ enabled }: { enabled?: boolean }) => {
  const result = useMetricQuery(TEST_SCHEMA, {
    enabled,
    filters: [{ dimension: "price", operator: ">=", value: 2 }],
    breakouts: [{ dimension: "createdAt", bucket: "month" }],
  });

  return (
    <div>
      <div data-testid="first-row-value">
        {String(result.data?.rows[0]?.count ?? "")}
      </div>
      <button onClick={() => result.refetch()}>Refetch</button>
    </div>
  );
};

function setup({
  queryMetric,
  enabled,
}: {
  queryMetric: jest.Mock;
  enabled?: boolean;
}) {
  const { state } = setupSdkState();

  renderWithSDKProviders(<TestComponent enabled={enabled} />, {
    metabaseEmbeddingSdkBundleExports: {
      getLoginStatus,
      queryMetric,
    },
    storeInitialState: state,
    componentProviderProps: {
      authConfig: createMockSdkConfig(),
    },
  });
}
