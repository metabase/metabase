import type React from "react";
import { t } from "ttag";

import { colors } from "metabase/lib/colors";
import { Card, Text } from "metabase/ui";

interface VisualizationEmbedProps {
  questionId: number;
  title?: string;
  description?: string;
}

interface PieChartData {
  category: string;
  value: number;
  color: string;
}

interface VisualizationData {
  type: "pie" | "scatter" | "combo" | "unknown";
  title: string;
  description: string;
  data: PieChartData[] | string;
}

export const VisualizationEmbed: React.FC<VisualizationEmbedProps> = ({
  questionId,
  title,
  description,
}) => {
  // For now, we'll create a placeholder that shows the question ID
  // In a real implementation, this would fetch and render the actual visualization
  const getVisualizationPlaceholder = (id: number): VisualizationData => {
    const visualizations: Record<number, VisualizationData> = {
      7: {
        type: "pie",
        title: "Product breakdown",
        description: "Distribution of products by category",
        data: [
          { category: "Doohickey", value: 45, color: colors.brand },
          { category: "Gadget", value: 28, color: colors.accent1 },
          { category: "Gizmo", value: 18, color: colors.accent2 },
          { category: "Widget", value: 9, color: colors.accent3 },
        ],
      },
      8: {
        type: "scatter",
        title: "Total order amount vs. discount given",
        description: "Analysis of discounts given vs. the size of the order",
        data: "Scatter plot showing correlation between order total and discount amount",
      },
      12: {
        type: "combo",
        title: "Revenue and orders over time",
        description: "Cumulative revenue overlaid with number of orders placed each month",
        data: "Combination chart showing revenue and order trends over time",
      },
    };

    return visualizations[id] || {
      type: "unknown",
      title: `Question ${id}`,
      description: "Visualization not found",
      data: "No data available",
    };
  };

  const viz = getVisualizationPlaceholder(questionId);

  const renderPieChart = (data: PieChartData[]) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ width: "120px", height: "120px", position: "relative" }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={colors.border}
              strokeWidth="2"
            />
            {data.map((item, index) => {
              const startAngle = data
                .slice(0, index)
                .reduce((sum, d) => sum + (d.value / total) * 360, 0);
              const endAngle = startAngle + (item.value / total) * 360;

              const x1 = 60 + 50 * Math.cos((startAngle - 90) * Math.PI / 180);
              const y1 = 60 + 50 * Math.sin((startAngle - 90) * Math.PI / 180);
              const x2 = 60 + 50 * Math.cos((endAngle - 90) * Math.PI / 180);
              const y2 = 60 + 50 * Math.sin((endAngle - 90) * Math.PI / 180);

              const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

              return (
                <path
                  key={item.category}
                  d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                  fill={item.color}
                />
              );
            })}
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          {data.map((item) => (
            <div
              key={item.category}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.25rem",
              }}
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: item.color,
                }}
              />
              <Text size="sm">
                {item.category}: {item.value}%
              </Text>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderVisualization = () => {
    switch (viz.type) {
      case "pie":
        return renderPieChart(viz.data as PieChartData[]);
      case "scatter":
      case "combo":
      default:
        return (
          <div
            style={{
              height: "200px",
              backgroundColor: "var(--mb-color-bg-light)",
              border: "1px solid var(--mb-color-border)",
              borderRadius: "0.375rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--mb-color-text-medium)",
            }}
          >
            <Text size="sm" ta="center">
              {typeof viz.data === "string" ? viz.data : "Chart data"}
            </Text>
          </div>
        );
    }
  };

  return (
    <Card
      shadow="none"
      withBorder
      style={{
        margin: "1rem 0",
        padding: "1rem",
      }}
    >
      <div style={{ marginBottom: "0.75rem" }}>
        <Text size="lg" fw={600} style={{ marginBottom: "0.25rem" }}>
          {title || viz.title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
      </div>
      {renderVisualization()}
      <div
        style={{
          marginTop: "0.75rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid var(--mb-color-border)",
        }}
      >
        <Text size="xs" c="dimmed">
          {t`Embedded visualization from question ${questionId}`}
        </Text>
      </div>
    </Card>
  );
};
