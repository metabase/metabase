import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import registerVisualizations from "metabase/visualizations/register";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import { createMockColumn } from "metabase-types/api/mocks";
import Question from "metabase-lib/Question";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const setup = () => {
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
      data: {
        rows: [[1000]],
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
    },
  ];

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
    setup();

    expect(screen.getByText("X-axis")).toBeInTheDocument();
    expect(screen.getByText("No valid fields")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
  });
});
