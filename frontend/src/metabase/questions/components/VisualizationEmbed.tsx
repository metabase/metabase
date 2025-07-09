import type React from "react";
import { t } from "ttag";

import { Card, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";

interface VisualizationEmbedProps {
  questionId: number;
  title?: string;
  description?: string;
}

// Create sample data for different visualization types
const createSampleData = (questionId: number): RawSeries => {
  const baseCard = {
    id: questionId,
    name: `Question ${questionId}`,
    display: "pie" as const,
    visualization_settings: {},
    dataset_query: {
      type: "native" as const,
      native: { query: "" },
      database: 1,
    },
  };

  switch (questionId) {
    case 7:
      return [
        {
          card: {
            ...baseCard,
            display: "pie",
            visualization_settings: {
              "pie.show_legend": true,
              "pie.show_values": true,
            },
          },
          data: {
            cols: [
              {
                name: "category",
                display_name: "Category",
                base_type: "type/Text",
                semantic_type: "type/Category",
              },
              {
                name: "count",
                display_name: "Count",
                base_type: "type/Integer",
                semantic_type: "type/Number",
              },
            ],
            rows: [
              ["Doohickey", 45],
              ["Gadget", 28],
              ["Gizmo", 18],
              ["Widget", 9],
            ],
            rows_truncated: 0,
          },
          started_at: new Date().toISOString(),
        },
      ];

    case 8:
      return [
        {
          card: {
            ...baseCard,
            display: "scatter",
            visualization_settings: {
              "scatter.bubble": false,
              "scatter.show_legend": true,
            },
          },
          data: {
            cols: [
              {
                name: "order_amount",
                display_name: "Order Amount",
                base_type: "type/Decimal",
                semantic_type: "type/Currency",
              },
              {
                name: "discount",
                display_name: "Discount",
                base_type: "type/Decimal",
                semantic_type: "type/Currency",
              },
            ],
            rows: [
              [100, 5],
              [200, 10],
              [300, 15],
              [400, 20],
              [500, 25],
            ],
            rows_truncated: 0,
          },
          started_at: new Date().toISOString(),
        },
      ];

    case 12:
      return [
        {
          card: {
            ...baseCard,
            display: "combo",
            visualization_settings: {
              "graph.metrics": ["revenue", "orders"],
              "graph.dimensions": ["month"],
              "graph.show_values": false,
            },
          },
          data: {
            cols: [
              {
                name: "month",
                display_name: "Month",
                base_type: "type/Text",
                semantic_type: "type/Category",
              },
              {
                name: "revenue",
                display_name: "Revenue",
                base_type: "type/Decimal",
                semantic_type: "type/Currency",
              },
              {
                name: "orders",
                display_name: "Orders",
                base_type: "type/Integer",
                semantic_type: "type/Number",
              },
            ],
            rows: [
              ["Jan", 120000, 45],
              ["Feb", 135000, 52],
              ["Mar", 142000, 48],
              ["Apr", 158000, 61],
              ["May", 165000, 58],
            ],
            rows_truncated: 0,
          },
          started_at: new Date().toISOString(),
        },
      ];

    default:
      return [
        {
          card: {
            ...baseCard,
            display: "table",
            visualization_settings: {},
          },
          data: {
            cols: [
              {
                name: "metric",
                display_name: "Metric",
                base_type: "type/Text",
                semantic_type: "type/Category",
              },
              {
                name: "value",
                display_name: "Value",
                base_type: "type/Integer",
                semantic_type: "type/Number",
              },
            ],
            rows: [
              ["Total Sales", 1250],
              ["Average Order", 85],
              ["Customers", 450],
            ],
            rows_truncated: 0,
          },
          started_at: new Date().toISOString(),
        },
      ];
  }
};

export const VisualizationEmbed: React.FC<VisualizationEmbedProps> = ({
  questionId,
  title,
  description,
}) => {
  const rawSeries = createSampleData(questionId);

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
          {title || `Question ${questionId}`}
        </Text>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
      </div>

      <div style={{ height: "300px", width: "100%" }}>
        <Visualization
          rawSeries={rawSeries}
          showTitle={false}
          isDashboard={false}
          isQueryBuilder={false}
          isEditing={false}
          isMobile={false}
          isNightMode={false}
          isSettings={false}
          isEmbeddingSdk={false}
          isFullscreen={false}
          isVisualizerViz={false}
          showAllLegendItems={false}
          isRawTable={false}
          scrollToLastColumn={false}
          width={400}
          height={280}
          onRender={() => {}}
          onRenderError={() => {}}
          onActionDismissal={() => {}}
          onHoverChange={() => {}}
          onVisualizationClick={() => {}}
          onUpdateVisualizationSettings={() => {}}
          visualizationIsClickable={() => false}
          dispatch={() => {}}
          fontFamily="Lato, sans-serif"
          hasDevWatermark={false}
        />
      </div>

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
