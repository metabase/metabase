// these tests use ChartSettings directly, but logic we're testing lives in ChartNestedSettingSeries
import { renderWithProviders, screen } from "__support__/ui";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";

registerVisualizations();

function getSeries(metrics) {
  return [
    {
      card: {
        dataset_query: {
          type: "native",
          native: {
            query:
              "select 'dogs' as pets, 50 as male, 45 as female union all select 'cats', 45, 20",
            "template-tags": {},
          },
          database: 1,
        },
        display: "bar",
        displayIsLocked: true,
        parameters: [],
        visualization_settings: {
          "graph.dimensions": ["PETS"],
          "graph.metrics": metrics,
        },
      },
      data: {
        rows: [
          ["dogs", 50, 45],
          ["cats", 45, 20],
        ],
        cols: [
          {
            display_name: "PETS",
            source: "native",
            field_ref: [
              "field",
              "PETS",
              {
                "base-type": "type/Text",
              },
            ],
            name: "PETS",
            base_type: "type/Text",
            effective_type: "type/Text",
          },
          {
            display_name: "MALE",
            source: "native",
            field_ref: [
              "field",
              "MALE",
              {
                "base-type": "type/Integer",
              },
            ],
            name: "MALE",
            base_type: "type/Integer",
            effective_type: "type/Integer",
          },
          {
            display_name: "FEMALE",
            source: "native",
            field_ref: [
              "field",
              "FEMALE",
              {
                "base-type": "type/Integer",
              },
            ],
            name: "FEMALE",
            base_type: "type/Integer",
            effective_type: "type/Integer",
          },
        ],
      },
    },
  ];
}

const setup = seriesMetrics => {
  return renderWithProviders(
    <ChartSettings
      series={getSeries(seriesMetrics)}
      initial={{ section: "Display" }}
    />,
  );
};

describe("ChartSettingsStacked", () => {
  it("should not show stacking options when there is only 1 series", () => {
    setup(["MALE"]);

    expect(screen.queryByText(/Stacking/)).not.toBeInTheDocument();
  });

  it("should show stacking options when there is more than 1 series", () => {
    setup(["MALE", "FEMALE"]);

    expect(screen.getByText(/Stacking/)).toBeInTheDocument();
    expect(screen.getByLabelText("Don't stack")).toBeInTheDocument();
    expect(screen.getByLabelText("Stack")).toBeInTheDocument();
    expect(screen.getByLabelText("Stack - 100%")).toBeInTheDocument();
  });
});
