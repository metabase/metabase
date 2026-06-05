import type { StoryFn } from "@storybook/react";
import type { CSSProperties, JSXElementConstructor } from "react";
import { useMemo } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { SdkQuestionId } from "embedding-sdk-bundle/types";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";

import type { QueryData } from "../data-schema";

import { useQuestionQuery } from "./use-question-query";

type StoryQueryData = QueryData<Record<string, unknown>>;

const QUESTION_ID = (window as any).QUESTION_ID || 12;
const config = getStorybookSdkAuthConfigForUser("admin");

export default {
  title: "EmbeddingSDK/use-question-query",
  decorators: [getHostedBundleStoryDecorator()],
  argTypes: {
    questionId: {
      control: "text",
    },
  },
  args: {
    questionId: QUESTION_ID,
  },
};

type HookStoryArgs = {
  questionId: SdkQuestionId | string;
};

const QuestionQueryResult = ({ questionId }: HookStoryArgs) => {
  const normalizedQuestionId = normalizeQuestionId(questionId);
  const { data, isLoading, error, refetch } =
    useQuestionQuery(normalizedQuestionId);

  const chart = useMemo(() => (data ? buildChartModel(data) : null), [data]);
  const serializedError = serializeError(error);

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>useQuestionQuery demo</div>
            <h1 style={titleStyle}>{data?.name ?? "Question result"}</h1>
            <div style={subtitleStyle}>
              {data
                ? `${data.rowCount ?? data.rows.length} rows returned in ${
                    data.runningTime ?? "-"
                  } ms`
                : `Question ${normalizedQuestionId}`}
            </div>
          </div>
          <button
            type="button"
            onClick={refetch}
            disabled={isLoading}
            style={buttonStyle}
          >
            {isLoading ? "Loading..." : "Refetch"}
          </button>
        </header>

        {error ? (
          <section style={errorPanelStyle}>
            <div style={sectionTitleStyle}>Error</div>
            <pre style={codeBlockStyle}>
              {JSON.stringify(serializedError, null, 2)}
            </pre>
          </section>
        ) : null}

        {data ? (
          <CustomSalesVisualization data={data} chart={chart} />
        ) : (
          <section style={panelStyle}>
            <div style={emptyStateStyle}>
              {isLoading ? "Loading question data..." : "No data yet"}
            </div>
          </section>
        )}

        <section style={jsonPanelStyle}>
          <div style={jsonHeaderStyle}>
            <div style={sectionTitleStyle}>Flattened result</div>
            <div
              style={mutedTextStyle}
            >{`{ data, error, isLoading, refetch }`}</div>
          </div>
          <pre style={codeBlockStyle}>{JSON.stringify(data, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
};

function CustomSalesVisualization({
  data,
  chart,
}: {
  data: StoryQueryData;
  chart: ChartModel | null;
}) {
  if (!chart) {
    return <RowsTable data={data} />;
  }

  return (
    <section style={panelStyle}>
      <div style={chartHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>Custom channel trend</div>
          <div style={mutedTextStyle}>
            Built from rows returned by useQuestionQuery
          </div>
        </div>
        <div style={totalBlockStyle}>
          <div style={tinyLabelStyle}>Total</div>
          <div style={totalValueStyle}>{formatNumber(chart.grandTotal)}</div>
        </div>
      </div>

      <div style={legendStyle}>
        {chart.categories.map((category, index) => (
          <div key={category} style={legendItemStyle}>
            <span
              style={{
                ...legendSwatchStyle,
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
            <span>{category}</span>
          </div>
        ))}
      </div>

      <div style={barsStyle}>
        {chart.months.map((month) => (
          <div key={month.key} style={monthRowStyle}>
            <div style={monthMetaStyle}>
              <span style={monthLabelStyle}>{month.label}</span>
              <span style={monthTotalStyle}>{formatNumber(month.total)}</span>
            </div>
            <div style={barTrackStyle}>
              {month.segments.map((segment) => (
                <div
                  key={`${month.key}-${segment.category}`}
                  title={`${segment.category}: ${formatNumber(segment.value)}`}
                  style={{
                    ...barSegmentStyle,
                    width: `${segment.width}%`,
                    minWidth: segment.value > 0 ? 2 : 0,
                    backgroundColor: segment.color,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RowsTable({ data }: { data: StoryQueryData }) {
  return (
    <section style={panelStyle}>
      <div style={tableIntroStyle}>
        <div style={sectionTitleStyle}>Custom rows preview</div>
        <div style={mutedTextStyle}>
          This question does not look like month/category/metric data, so the
          story renders a small custom table instead.
        </div>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column.name} style={tableHeaderStyle}>
                {column.display_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rawRows.slice(0, 8).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, valueIndex) => (
                <td key={valueIndex} style={tableCellStyle}>
                  {formatValue(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type ChartModel = {
  categories: string[];
  grandTotal: number;
  months: {
    key: string;
    label: string;
    total: number;
    segments: {
      category: string;
      color: string;
      value: number;
      width: number;
    }[];
  }[];
};

function buildChartModel(data: StoryQueryData): ChartModel | null {
  const dateIndex = data.columns.findIndex((column) =>
    [column.base_type, column.effective_type].some((type) =>
      type?.includes("DateTime"),
    ),
  );
  const categoryIndex = data.columns.findIndex((column, index) => {
    return index !== dateIndex && column.effective_type === "type/Text";
  });
  const metricIndex = data.columns.findIndex((column, index) => {
    return (
      index !== dateIndex &&
      index !== categoryIndex &&
      (column.source === "aggregation" ||
        column.effective_type?.includes("Integer") ||
        column.effective_type?.includes("Float"))
    );
  });

  if (dateIndex < 0 || categoryIndex < 0 || metricIndex < 0) {
    return null;
  }

  const totalsByMonth = new Map<string, Map<string, number>>();
  const categorySet = new Set<string>();

  for (const row of data.rawRows) {
    const month = getMonthKey(row[dateIndex]);
    const category = String(row[categoryIndex] ?? "Unknown");
    const value = Number(row[metricIndex] ?? 0);

    if (!month || !Number.isFinite(value)) {
      continue;
    }

    categorySet.add(category);

    const monthTotals = totalsByMonth.get(month) ?? new Map<string, number>();
    monthTotals.set(category, (monthTotals.get(category) ?? 0) + value);
    totalsByMonth.set(month, monthTotals);
  }

  const categories = Array.from(categorySet).sort();
  const monthKeys = Array.from(totalsByMonth.keys()).sort();
  const monthTotals = monthKeys.map((month) => {
    const total = sum(Array.from(totalsByMonth.get(month)?.values() ?? []));

    return { month, total };
  });
  const maxMonthTotal = Math.max(...monthTotals.map(({ total }) => total), 1);
  const grandTotal = sum(monthTotals.map(({ total }) => total));

  return {
    categories,
    grandTotal,
    months: monthKeys.map((month) => {
      const values = totalsByMonth.get(month) ?? new Map<string, number>();
      const total = sum(Array.from(values.values()));

      return {
        key: month,
        label: formatMonth(month),
        total,
        segments: categories.map((category, index) => {
          const value = values.get(category) ?? 0;

          return {
            category,
            color: CHART_COLORS[index % CHART_COLORS.length],
            value,
            width: (value / maxMonthTotal) * 100,
          };
        }),
      };
    }),
  };
}

function getMonthKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1));

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return JSON.stringify(value);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function normalizeQuestionId(
  questionId: SdkQuestionId | string,
): SdkQuestionId {
  if (typeof questionId === "string" && /^\d+$/.test(questionId)) {
    return Number(questionId);
  }

  return questionId as SdkQuestionId;
}

function serializeError(error: unknown) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "object") {
    return error;
  }

  return String(error);
}

const HookTemplate: StoryFn<JSXElementConstructor<HookStoryArgs>> = (args) => (
  <MetabaseProvider authConfig={config}>
    <QuestionQueryResult {...args} />
  </MetabaseProvider>
);

export const Default = {
  args: {
    questionId: "161",
  },
  render: HookTemplate,
};

export const SqlTableQuestion = {
  args: {
    questionId: "244",
  },
  render: HookTemplate,
};

const CHART_COLORS = ["#509EE3", "#88BF4D", "#EF8C8C", "#F9CF48", "#A989C5"];

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: 32,
  background: "#F7F8FA",
  color: "#1F2937",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const contentStyle: CSSProperties = {
  maxWidth: 1120,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const eyebrowStyle: CSSProperties = {
  marginBottom: 6,
  color: "#6B7280",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: 30,
  fontWeight: 750,
  lineHeight: 1.15,
  letterSpacing: 0,
};

const subtitleStyle: CSSProperties = {
  marginTop: 8,
  color: "#6B7280",
  fontSize: 14,
  lineHeight: 1.45,
};

const buttonStyle: CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  background: "#FFFFFF",
  color: "#111827",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 650,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(17, 24, 39, 0.06)",
};

const panelStyle: CSSProperties = {
  padding: 20,
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  background: "#FFFFFF",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.06)",
};

const errorPanelStyle: CSSProperties = {
  ...panelStyle,
  borderColor: "#FCA5A5",
  background: "#FFF7F7",
};

const jsonPanelStyle: CSSProperties = {
  ...panelStyle,
  padding: 0,
  overflow: "hidden",
};

const jsonHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderBottom: "1px solid #E5E7EB",
};

const sectionTitleStyle: CSSProperties = {
  color: "#111827",
  fontSize: 16,
  fontWeight: 750,
  lineHeight: 1.25,
};

const mutedTextStyle: CSSProperties = {
  color: "#6B7280",
  fontSize: 13,
  lineHeight: 1.45,
};

const emptyStateStyle: CSSProperties = {
  color: "#6B7280",
  fontSize: 14,
};

const chartHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 20,
  marginBottom: 18,
};

const totalBlockStyle: CSSProperties = {
  minWidth: 140,
  padding: "10px 12px",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  background: "#F9FAFB",
  textAlign: "right",
};

const tinyLabelStyle: CSSProperties = {
  color: "#6B7280",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const totalValueStyle: CSSProperties = {
  marginTop: 2,
  color: "#111827",
  fontSize: 22,
  fontWeight: 750,
  lineHeight: 1.1,
};

const legendStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px 18px",
  marginBottom: 18,
};

const legendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  color: "#374151",
  fontSize: 13,
  fontWeight: 600,
};

const legendSwatchStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 3,
};

const barsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const monthRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "128px minmax(0, 1fr)",
  alignItems: "center",
  gap: 12,
};

const monthMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const monthLabelStyle: CSSProperties = {
  color: "#111827",
  fontSize: 13,
  fontWeight: 700,
};

const monthTotalStyle: CSSProperties = {
  color: "#6B7280",
  fontSize: 12,
};

const barTrackStyle: CSSProperties = {
  display: "flex",
  height: 28,
  overflow: "hidden",
  borderRadius: 6,
  background: "#EEF2F7",
};

const barSegmentStyle: CSSProperties = {
  height: "100%",
  transition: "width 160ms ease",
};

const tableIntroStyle: CSSProperties = {
  marginBottom: 16,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const tableHeaderStyle: CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  color: "#6B7280",
  fontSize: 12,
  fontWeight: 700,
  borderBottom: "1px solid #E5E7EB",
};

const tableCellStyle: CSSProperties = {
  padding: "8px 10px",
  color: "#111827",
  fontSize: 13,
  borderBottom: "1px solid #F3F4F6",
};

const codeBlockStyle: CSSProperties = {
  margin: 0,
  padding: 16,
  overflow: "auto",
  maxHeight: 420,
  background: "#111827",
  color: "#F9FAFB",
  fontSize: 12,
  lineHeight: 1.5,
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};
