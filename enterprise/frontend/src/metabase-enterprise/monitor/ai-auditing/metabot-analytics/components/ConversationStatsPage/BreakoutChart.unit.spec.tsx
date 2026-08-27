import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { DateFilterValue } from "metabase/querying/common/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Dataset } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { BreakoutChart } from "./BreakoutChart";
import { ConversationsByDayChart } from "./ConversationsByDayChart";
import { buildAuditViewsFixture } from "./audit-views-fixture";
import {
  type UsageStatsMetric,
  buildSourceBreakoutQuery,
  tableForMetric,
} from "./query-utils";
import type { ChartDataSources } from "./types";

registerVisualizations();

const LAST_30_DAYS: DateFilterValue = {
  type: "relative",
  unit: "day",
  value: -30,
  options: { includeCurrent: true },
};

const SINGLE_DAY: DateFilterValue = {
  type: "specific",
  operator: "=",
  values: [new Date(2026, 3, 17)],
  hasTime: false,
};

const fixture = buildAuditViewsFixture();

const METRICS: UsageStatsMetric[] = ["conversations", "messages", "tokens"];

const buildTitles = (suffix: string): Record<UsageStatsMetric, string> => ({
  conversations: `Conversations ${suffix}`,
  messages: `Messages ${suffix}`,
  tokens: `Tokens ${suffix}`,
});

const TITLES = buildTitles("by source");
const DAILY_TITLES = buildTitles("by day");
const HOURLY_TITLES = buildTitles("by hour");

const AGGREGATION_NAMES: Record<UsageStatsMetric, string[]> = {
  conversations: ["count"],
  messages: ["sum"],
  tokens: ["sum", "sum_2"],
};

type BreakoutColumnSpec = Parameters<typeof createMockColumn>[0];

const SOURCE_BREAKOUT: BreakoutColumnSpec = {
  source: "breakout",
  name: "source_name",
  display_name: "Source",
};

const TIMESERIES_BREAKOUT: BreakoutColumnSpec = {
  source: "breakout",
  name: "created_at",
  display_name: "Created at",
  base_type: "type/DateTimeWithLocalTZ",
  unit: "day",
};

function buildDataset(
  metric: UsageStatsMetric,
  breakoutColumn: BreakoutColumnSpec,
  breakoutValues: string[],
): Dataset {
  const aggregationNames = AGGREGATION_NAMES[metric];

  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn(breakoutColumn),
        ...aggregationNames.map((name) =>
          createMockColumn({
            source: "aggregation",
            name,
            display_name: name,
            base_type: "type/BigInteger",
          }),
        ),
      ],
      rows: breakoutValues.map((value, index) => [
        value,
        ...aggregationNames.map((_, offset) => (index + 1) * 10 + offset),
      ]),
    }),
    row_count: breakoutValues.length,
  });
}

function dataSources(metric: UsageStatsMetric): ChartDataSources {
  return {
    provider: fixture.provider,
    table: tableForMetric(metric, fixture.conversations, fixture.usageLog),
    groupMembersTable: fixture.groupMembers,
  };
}

function setupBreakoutChart(metric: UsageStatsMetric, display: "bar" | "row") {
  fetchMock.post(
    "path:/api/dataset",
    buildDataset(metric, SOURCE_BREAKOUT, ["Slackbot", "Internal"]),
  );

  return renderWithProviders(
    <BreakoutChart
      {...dataSources(metric)}
      metric={metric}
      dateFilter={LAST_30_DAYS}
      titles={TITLES}
      display={display}
      buildQuery={(opts) =>
        buildSourceBreakoutQuery({ ...opts, breakoutColumn: "source_name" })
      }
    />,
  );
}

function setupTimeseriesChart(
  metric: UsageStatsMetric,
  dateFilter: DateFilterValue = LAST_30_DAYS,
) {
  fetchMock.post(
    "path:/api/dataset",
    buildDataset(metric, TIMESERIES_BREAKOUT, [
      "2026-04-15T00:00:00",
      "2026-04-16T00:00:00",
    ]),
  );

  return renderWithProviders(
    <ConversationsByDayChart
      {...dataSources(metric)}
      metric={metric}
      dateFilter={dateFilter}
    />,
  );
}

describe("metabot usage stats charts", () => {
  it.each(METRICS)("renders a bar chart for %s", async (metric) => {
    setupBreakoutChart(metric, "bar");

    expect(await screen.findByText(TITLES[metric])).toBeInTheDocument();
    const container = await screen.findByTestId("chart-container");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a row chart", async () => {
    setupBreakoutChart("conversations", "row");

    expect(await screen.findByText(TITLES.conversations)).toBeInTheDocument();
    expect(
      await screen.findByTestId("row-chart-container"),
    ).toBeInTheDocument();
  });

  it.each(METRICS)("renders the daily timeseries for %s", async (metric) => {
    setupTimeseriesChart(metric);

    expect(await screen.findByText(DAILY_TITLES[metric])).toBeInTheDocument();
    const container = await screen.findByTestId("chart-container");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it.each(METRICS)(
    "renders the hourly timeseries for %s with a single-day filter",
    async (metric) => {
      setupTimeseriesChart(metric, SINGLE_DAY);

      expect(
        await screen.findByText(HOURLY_TITLES[metric]),
      ).toBeInTheDocument();
      expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
    },
  );

  it("shows a skeleton until the audit table metadata is available", () => {
    renderWithProviders(
      <BreakoutChart
        provider={null}
        table={null}
        groupMembersTable={null}
        metric="conversations"
        dateFilter={LAST_30_DAYS}
        titles={TITLES}
        display="bar"
        buildQuery={(opts) =>
          buildSourceBreakoutQuery({ ...opts, breakoutColumn: "source_name" })
        }
      />,
    );

    expect(screen.getByTestId("breakout-chart-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(TITLES.conversations)).not.toBeInTheDocument();
  });
});
