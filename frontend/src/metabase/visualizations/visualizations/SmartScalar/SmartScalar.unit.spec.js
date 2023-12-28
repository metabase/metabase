import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import registerVisualizations from "metabase/visualizations/register";

registerVisualizations();

const setup = (series, width) =>
  renderWithProviders(<Visualization rawSeries={series} width={width} />);

const series = ({ rows, insights, field }) => {
  const cols = [
    DateTimeColumn({ name: "Month" }),
    NumberColumn({ name: "Count" }),
    NumberColumn({ name: "Sum" }),
  ];
  return [
    {
      card: {
        display: "smartscalar",
        visualization_settings: { "scalar.field": field },
      },
      data: { cols, rows, insights },
    },
  ];
};

describe("SmartScalar", () => {
  describe("field selection", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100, 200],
      ["2019-11-01T00:00:00", 120, 220],
    ];
    const insights = [
      {
        "last-value": 120,
        "last-change": 0.2,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
      {
        "last-value": 220,
        "last-change": 0.1,
        "previous-value": 200,
        unit: "month",
        col: "Sum",
      },
    ];
    it("should use first non-date column (Count) by default", () => {
      setup(series({ rows, insights }));
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      const lastChange = screen.getByText("20%");
      expect(lastChange).toBeInTheDocument();
      userEvent.hover(lastChange);
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });
    it("should use Count when selected", () => {
      setup(series({ rows, insights, field: "Count" }));
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      const lastChange = screen.getByText("20%");
      expect(lastChange).toBeInTheDocument();
      userEvent.hover(lastChange);
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });
    it("should use Sum when selected", () => {
      setup(series({ rows, insights, field: "Sum" }));
      expect(screen.getByText("220")).toBeInTheDocument();
      expect(screen.getByText("Nov 2019")).toBeInTheDocument();
      const lastChange = screen.getByText("10%");
      expect(lastChange).toBeInTheDocument();
      userEvent.hover(lastChange);
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
    });
  });
  it("should show 20% increase", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 120],
    ];
    const insights = [
      {
        "last-value": 120,
        "last-change": 0.2,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }));

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Nov 2019")).toBeInTheDocument();

    const lastChange = screen.getByText("20%");
    expect(lastChange).toBeInTheDocument();

    userEvent.hover(lastChange);
    expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("should show 20% decrease", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 80],
    ];
    const insights = [
      {
        "last-value": 80,
        "last-change": -0.2,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }));

    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("Nov 2019")).toBeInTheDocument();

    const lastChange = screen.getByText("20%");
    expect(lastChange).toBeInTheDocument();

    userEvent.hover(lastChange);
    expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("should show 0% change", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 100],
    ];
    const insights = [
      {
        "last-value": 100,
        "last-change": 0,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }));

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Nov 2019")).toBeInTheDocument();
    expect(screen.getByText("No change from last month")).toBeInTheDocument();
  });

  it("should show 8000% change", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      [("2019-11-01T00:00:00", 8100)],
    ];
    const insights = [
      {
        "last-value": 8100,
        "last-change": 80,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }));

    expect(screen.getByText("8,000%")).toBeInTheDocument();
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
    const insights = [
      {
        "last-value": 81005,
        "last-change": 80,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }), width);

    expect(screen.getByText("81,005")).toBeInTheDocument();
  });

  it("should render compact if normal formatting is >6 characters and width <250", () => {
    const width = 200;
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 810750.54],
    ];
    const insights = [
      {
        "last-value": 810750.54,
        "last-change": 80,
        "previous-value": 100,
        unit: "month",
        col: "Count",
      },
    ];

    setup(series({ rows, insights }), width);

    expect(screen.getByText("810.8k")).toBeInTheDocument();
  });
});
