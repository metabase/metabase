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
      { unit: "month", col: "Count" },
      { unit: "month", col: "Sum" },
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
    const insights = [{ unit: "month", col: "Count" }];

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
    const insights = [{ unit: "month", col: "Count" }];

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
    expect(screen.getByText("(empty)")).toBeInTheDocument();
  });

  it("should skip over rows with null values", () => {
    const rows = [
      ["2019-09-01T00:00:00", 100],
      ["2019-10-01T00:00:00", null],
      ["2019-11-01T00:00:00", 100],
    ];
    const insights = [{ unit: "month", col: "Count" }];

    setup(series({ rows, insights }), 400);

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Nov 2019")).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
    expect(screen.getByText("vs. Sep 2019")).toBeInTheDocument();
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
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "arrow_up icon",
    );
    expect(screen.getByText("∞%")).toBeInTheDocument();
    expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
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
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "arrow_down icon",
    );
    expect(screen.getByText("∞%")).toBeInTheDocument();
    expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("should show 8000% change", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 8100],
    ];
    const insights = [{ unit: "month", col: "Count" }];

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
});
