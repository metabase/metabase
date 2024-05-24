import userEvent from "@testing-library/user-event";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import registerVisualizations from "metabase/visualizations/register";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";

import { COMPARISON_TYPES } from "./constants";

registerVisualizations();

const setup = (series, width = 800) =>
  renderWithProviders(<Visualization rawSeries={series} width={width} />);

const PREVIOUS_PERIOD_COMPARISON = {
  id: "1",
  type: COMPARISON_TYPES.PREVIOUS_PERIOD,
};

const PREVIOUS_VALUE_COMPARISON = {
  id: "1",
  type: COMPARISON_TYPES.PREVIOUS_VALUE,
};

const getPeriodsAgoComparison = value => ({
  id: "1",
  type: COMPARISON_TYPES.PERIODS_AGO,
  value,
});

const series = ({
  rows,
  insights,
  field,
  comparisonType = PREVIOUS_PERIOD_COMPARISON,
} = {}) => {
  const cols = [
    DateTimeColumn({ name: "Month" }),
    NumberColumn({ name: "Count" }),
    NumberColumn({ name: "Sum" }),
  ];
  return [
    {
      card: {
        display: "smartscalar",
        visualization_settings: {
          "scalar.field": field,
          "scalar.comparisons": [comparisonType],
        },
        dataset_query: createMockStructuredDatasetQuery(),
      },
      data: { cols, rows, insights },
    },
  ];
};

describe("SmartScalar", () => {
  describe("current metric display", () => {
    it("should show metric value and date", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }));

      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
    });
  });

  describe("comparison display", () => {
    it("should show increase", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }));

      expect(getIcon("arrow_up")).toBeInTheDocument();
      expect(screen.getByText("20%")).toBeInTheDocument();

      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("should show ↑ ∞% change", () => {
      const rows = [
        ["2019-10-01T00:00:00", 0],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(getIcon("arrow_up")).toBeInTheDocument();

      expect(screen.getByText("∞%")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("should show decrease", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 80],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }));

      expect(screen.getByText("80")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();

      expect(getIcon("arrow_down")).toBeInTheDocument();

      expect(screen.getByText("20%")).toBeInTheDocument();

      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("should show ↓ ∞% change", () => {
      const rows = [
        ["2019-10-01T00:00:00", 0],
        ["2019-11-01T00:00:00", -100],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("-100")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(getIcon("arrow_down")).toBeInTheDocument();

      expect(screen.getByText("∞%")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("should show 0% change", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(screen.getByText("No change")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month")).toBeInTheDocument();
    });

    it("should show when data is missing", () => {
      const rows = [
        ["2019-10-01T00:00:00", null],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(screen.getByText("N/A")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("(No data)")).toBeInTheDocument();
    });

    it("shouldn't throw an error getting settings for single-column data", () => {
      const card = { display: "smartscalar", visualization_settings: {} };
      const data = { cols: [NumberColumn({ name: "Count" })], rows: [[100]] };
      expect(() => getSettingsWidgetsForSeries([{ card, data }])).not.toThrow();
    });

    it("shouldn't render compact if normal formatting is <=6 characters", () => {
      const width = 200;
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 81005],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), width);

      expect(screen.getByText("81,005")).toBeInTheDocument();
    });

    it("should render compact if normal formatting is >6 characters and width <250", () => {
      const width = 200;
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 810750.54],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), width);

      expect(screen.getByText("810.8k")).toBeInTheDocument();
    });

    it("should display tooltip with comparison info if card is not wide enough", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(series({ rows, insights }), 50);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();

      // can see arrow and percent change
      expect(getIcon("arrow_up")).toBeInTheDocument();

      const lastChange = screen.getByText("100%");
      expect(lastChange).toBeInTheDocument();

      // cannot see comparison period or comparison value b/c they are hidden
      expect(screen.queryByText("vs. previous month:")).not.toBeInTheDocument();
      expect(screen.queryByText("50")).not.toBeInTheDocument();

      // show tool-tip
      await userEvent.hover(lastChange);
      expect(screen.queryAllByLabelText("arrow_up icon")).toHaveLength(2);
      expect(screen.queryAllByText("100%")).toHaveLength(2);
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });
  });

  describe("field selection", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100, 200],
      ["2019-11-01T00:00:00", 120, 220],
    ];
    const insights = [
      { unit: "month", col: "Count" },
      { unit: "month", col: "Sum" },
    ];

    it("should use first non-date column (Count) by default", () => {
      setup(
        series({
          rows,
          insights,
        }),
      );
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(screen.getByText("20%")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("should use Count when selected", () => {
      setup(series({ rows, insights, field: "Count" }));
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(screen.getByText("20%")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("should use Sum when selected", () => {
      setup(series({ rows, insights, field: "Sum" }));
      expect(screen.getByText("220")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      expect(screen.getByText("10%")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    describe("comparison: previousValue", () => {
      it("should skip over rows with null values", () => {
        const rows = [
          ["2019-09-01T00:00:00", 100],
          ["2019-10-01T00:00:00", null],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = [{ unit: "month", col: "Count" }];

        setup(
          series({ rows, insights, comparisonType: PREVIOUS_VALUE_COMPARISON }),
          400,
        );

        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText("Nov 2019")).toBeInTheDocument();
        expect(screen.getByText("No change")).toBeInTheDocument();
        expect(screen.getByText("vs. Sep")).toBeInTheDocument();
      });

      it("should handle no previous value to compare to", () => {
        const rows = [
          ["2019-10-01T00:00:00", null],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = [{ unit: "month", col: "Count" }];

        setup(
          series({ rows, insights, comparisonType: PREVIOUS_VALUE_COMPARISON }),
          400,
        );

        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText("Nov 2019")).toBeInTheDocument();
        expect(screen.getByText("N/A")).toBeInTheDocument();
        expect(screen.queryByText("vs. Oct:")).not.toBeInTheDocument();
        expect(screen.getByText("(No data)")).toBeInTheDocument();
      });
    });

    describe("comparison: periodsAgo", () => {
      it("should display exact date", () => {
        const rows = [
          ["2019-09-01T00:00:00", 100],
          ["2019-10-01T00:00:00", null],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = [{ unit: "month", col: "Count" }];

        setup(
          series({
            rows,
            insights,
            comparisonType: getPeriodsAgoComparison(2),
          }),
          400,
        );

        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText("Nov 2019")).toBeInTheDocument();
        expect(screen.getByText("No change")).toBeInTheDocument();
        expect(screen.getByText("vs. Sep")).toBeInTheDocument();
      });
    });
  });

  describe("should handle errors gracefully", () => {
    it("should show error display if error is thrown", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = [{ unit: "month", col: "Count" }];

      setup(
        series({
          rows,
          insights,
          comparisonType: getPeriodsAgoComparison("hi"),
        }),
      );

      expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
      expect(
        screen.getByText(
          "No integer value supplied for periods ago comparison.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("should not error when latest value is null (metabase#42948)", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 100],
      ["2019-12-01T00:00:00", null],
    ];
    const insights = [{ unit: "month", col: "Count" }];

    setup(
      series({
        rows,
        insights,
        comparisonType: getPeriodsAgoComparison(1),
      }),
    );

    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Nov 2019")).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
    expect(screen.getByText("vs. previous month")).toBeInTheDocument();
  });
});
