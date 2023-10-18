import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createSampleDatabase,
  ORDERS_ID,
  ORDERS,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import registerVisualizations from "metabase/visualizations/register";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import type { Series } from "metabase-types/api";
import Question from "metabase-lib/Question";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

interface SetupProps {
  question: Question;
  series: Series;
}

const setup = ({ series, question }: SetupProps) => {
  renderWithProviders(
    <ChartSettings
      series={series}
      quesiton={question}
      initial={{ section: "Data" }}
      noPreview
    />,
  );
};

describe("barchart", () => {
  it("should not error when rendering for a question with new breakouts", () => {
    const question = new Question(
      {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregrations: [["count"]],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {},
      },
      metadata,
    );

    const series = [
      {
        card: question.card(),
        ...createMockDataset({
          data: {
            cols: [
              createMockColumn({
                source: "aggregation",
                field_ref: ["aggregation", 0],
                name: "count",
                display_name: "Count",
                base_type: "type/BigInteger",
              }),
            ],
          },
        }),
      },
    ];
    setup({ question, series });

    expect(screen.getByText("X-axis")).toBeInTheDocument();
    expect(screen.getByText("No valid fields")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("should not ellipsify really long field names", () => {
    const longColumnName =
      "COLUMN THAT WILL BE BIG BIG BIG VERY BIG IN ORDER TO ACCOMMODAT";
    const question = new Question(
      {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregration: [["count"]],
            breakout: [["expression", longColumnName]],
            expressions: {
              longColumnName: [
                "get-month",
                ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
              ],
            },
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {},
      },
      metadata,
    );

    const series = [
      {
        card: question.card(),
        ...createMockDataset({
          data: {
            cols: [
              createMockColumn({
                source: "aggregation",
                field_ref: ["aggregation", 0],
                name: "count",
                display_name: "Count",
                base_type: "type/BigInteger",
              }),
              createMockColumn({
                source: "breakout",
                field_ref: ["expression", longColumnName],
                name: longColumnName,
                display_name: longColumnName,
                expression_name: longColumnName,
                base_type: "type/Integer",
              }),
            ],
          },
        }),
      },
    ];
    setup({ question, series });

    expect(screen.getByText(longColumnName)).toBeInTheDocument();
  });
});
