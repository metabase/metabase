import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import type { Series } from "metabase-types/api";
import Question from "metabase-lib/Question";

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
                field_ref: ["aggregation", 0, null],
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
});
