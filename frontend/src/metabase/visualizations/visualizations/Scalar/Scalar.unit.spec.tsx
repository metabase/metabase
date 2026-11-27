import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import {
  act,
  fireEvent,
  mockTextOverflow,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { color } from "metabase/ui/utils/colors";
import { defer } from "metabase/utils/promise";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  DatasetData,
  GoalSourceResults,
  RowValue,
  ScalarSegment,
  Series,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { Scalar } from "./Scalar";

registerVisualizations();

const series = (value: number | null = 1.23) =>
  // Unjustified type cast. FIXME
  [
    {
      card: createMockCard({ display: "scalar" }),
      data: { rows: [[value]], cols: [createMockColumn({ name: "count" })] },
    },
  ] as Series;

// Unjustified type cast. FIXME
const mockedProps = {} as ComponentProps<typeof Scalar>;

const settings = {
  "scalar.field": "count",
  "card.title": "Scalar Title",
  column: () => ({ column: { base_type: "type/Integer" } }),
};

describe("Scalar", () => {
  it("shouldn't render compact when the value fits the card", () => {
    renderWithProviders(
      <Scalar
        {...mockedProps}
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByText("12,345.6")).toBeInTheDocument();
  });

  it("should render compact when the value doesn't fit the card", () => {
    renderWithProviders(
      <Scalar
        {...mockedProps}
        series={series(12345.6)}
        rawSeries={series(12345.6)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={80}
      />,
    );
    expect(screen.getByText("12.3k")).toBeInTheDocument();
  });

  it.each([82, 126, 170, 214])(
    "should keep the title visible on a short card of width %s (#84334)",
    async (width) => {
      renderWithProviders(
        <Scalar
          {...mockedProps}
          showTitle
          series={series(12345.6)}
          rawSeries={series(12345.6)}
          settings={settings}
          visualizationIsClickable={() => false}
          width={width}
          height={82}
        />,
      );

      expect(screen.getByTestId("scalar-title")).toHaveTextContent(
        "Scalar Title",
      );
      await userEvent.hover(screen.getByTestId("scalar-content"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    },
  );

  it("should navigate to the question when the title is clicked", async () => {
    const onChangeCardAndRun = jest.fn();
    renderWithProviders(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={onChangeCardAndRun}
        width={230}
        height={150}
      />,
    );

    await userEvent.click(screen.getByText("Scalar Title"));

    expect(onChangeCardAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCard: expect.objectContaining({ display: "scalar" }),
      }),
    );
  });

  it("should render the real title link from the start so middle-click and copy-link never see a placeholder", () => {
    const getHref = jest.fn(() => "/question/42");
    renderWithProviders(
      <Scalar
        {...mockedProps}
        showTitle
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={jest.fn()}
        getHref={getHref}
        width={230}
        height={150}
      />,
    );

    const link = screen.getByTestId("legend-label");
    expect(link).toHaveAttribute("href", "/question/42");

    // interactions refresh the href in case it went stale
    fireEvent.mouseDown(link);
    expect(getHref).toHaveBeenCalledTimes(2);
  });

  it("should navigate from a visualizer card with a single underlying question", async () => {
    const onChangeCardAndRun = jest.fn();
    renderWithProviders(
      <Scalar
        {...mockedProps}
        showTitle
        isVisualizerCard
        titleMenuItems={<div>menu item</div>}
        visualizerRawSeries={series(999)}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={onChangeCardAndRun}
        width={230}
        height={150}
      />,
    );

    await userEvent.click(screen.getByText("Scalar Title"));

    expect(onChangeCardAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCard: expect.objectContaining({ display: "scalar" }),
      }),
    );
  });

  it("should not navigate from a visualizer card with several underlying questions", async () => {
    const onChangeCardAndRun = jest.fn();
    renderWithProviders(
      <Scalar
        {...mockedProps}
        showTitle
        isVisualizerCard
        titleMenuItems={[<div key="1" />, <div key="2" />]}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => false}
        onChangeCardAndRun={onChangeCardAndRun}
        width={230}
        height={150}
      />,
    );

    await userEvent.click(screen.getByText("Scalar Title"));

    expect(onChangeCardAndRun).not.toHaveBeenCalled();
  });

  it.each([82, 126, 230])(
    "should show the description on info icon hover at %i pixels wide",
    async (width) => {
      renderWithProviders(
        <Scalar
          {...mockedProps}
          showTitle
          series={series(12345)}
          rawSeries={series(12345)}
          settings={{ ...settings, "card.description": "Scalar description" }}
          visualizationIsClickable={() => false}
          width={width}
          height={150}
        />,
      );

      await userEvent.hover(screen.getByLabelText("info icon"));

      expect(await screen.findByText("Scalar description")).toBeInTheDocument();
    },
  );

  it.each([82, 126, 230])(
    "should open the description tooltip with keyboard navigation at %i pixels wide",
    async (width) => {
      renderWithProviders(
        <Scalar
          {...mockedProps}
          showTitle
          series={series(12345)}
          rawSeries={series(12345)}
          settings={{ ...settings, "card.description": "Scalar description" }}
          visualizationIsClickable={() => false}
          width={width}
          height={150}
        />,
      );

      // without a title link, the info icon is the first tabbable element
      await userEvent.tab();

      expect(await screen.findByText("Scalar description")).toBeInTheDocument();
    },
  );

  it("should not show the info icon while editing a dashboard", () => {
    renderWithProviders(
      <Scalar
        {...mockedProps}
        showTitle
        isDashboard
        isEditing
        series={series(12345)}
        rawSeries={series(12345)}
        settings={{ ...settings, "card.description": "Scalar description" }}
        visualizationIsClickable={() => false}
        width={230}
        height={150}
      />,
    );

    expect(screen.queryByLabelText("info icon")).not.toBeInTheDocument();
  });

  it("should render null", () => {
    renderWithProviders(
      <Scalar
        {...mockedProps}
        isDashboard // displays title
        showTitle
        series={series(null)}
        rawSeries={series(null)}
        settings={settings}
        visualizationIsClickable={() => false}
      />,
    );
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  describe("values wider than the card", () => {
    const TOKEN = "0d79f0c276571a3c7fd2b5b6db30c1a9";
    const textSeries = () =>
      // Unjustified type cast. FIXME
      [
        {
          card: createMockCard({ display: "scalar" }),
          data: {
            rows: [[TOKEN]],
            cols: [createMockColumn({ name: "count", base_type: "type/Text" })],
          },
        },
      ] as Series;

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should show the full value in a tooltip when the value is truncated", async () => {
      mockTextOverflow();
      renderWithProviders(
        <Scalar
          {...mockedProps}
          series={textSeries()}
          rawSeries={textSeries()}
          settings={settings}
          visualizationIsClickable={() => false}
          width={230}
        />,
      );

      await userEvent.hover(screen.getByTestId("scalar-value"));

      expect(
        within(await screen.findByRole("tooltip")).getByText(TOKEN),
      ).toBeInTheDocument();
    });

    it("should not show a tooltip for a value that fits", async () => {
      renderWithProviders(
        <Scalar
          {...mockedProps}
          series={textSeries()}
          rawSeries={textSeries()}
          settings={settings}
          visualizationIsClickable={() => false}
          width={230}
        />,
      );

      await userEvent.hover(screen.getByTestId("scalar-value"));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("lets Unicode subscript descenders render past the line box (metabase#72443)", () => {
    renderWithProviders(
      <Scalar
        {...mockedProps}
        series={series(344)}
        rawSeries={series(344)}
        settings={settings}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );
    expect(screen.getByTestId("scalar-container")).toHaveStyle({
      overflowY: "visible",
    });
  });

  it("should call onVisualizationClick with the clicked element when clickable", async () => {
    const onVisualizationClick = jest.fn();
    renderWithProviders(
      <Scalar
        {...mockedProps}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={settings}
        visualizationIsClickable={() => true}
        onVisualizationClick={onVisualizationClick}
        width={230}
      />,
    );

    await userEvent.click(screen.getByText("12,345"));

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 12345,
        column: expect.objectContaining({ name: "count" }),
        element: expect.any(HTMLElement),
      }),
    );
  });

  it("should fall back to the first column when scalar.field matches no column", () => {
    renderWithProviders(
      <Scalar
        {...mockedProps}
        series={series(12345)}
        rawSeries={series(12345)}
        settings={{ ...settings, "scalar.field": "not-a-column" }}
        visualizationIsClickable={() => false}
        width={230}
      />,
    );

    expect(screen.getByText("12,345")).toBeInTheDocument();
  });
});

describe("Scalar conditional colors", () => {
  const GOAL_REF = { type: "card", id: 9, column: "goal" } as const;

  type StatusCode = number;

  type SetupOpts = {
    goalSourceResults?:
      | GoalSourceResults
      | StatusCode
      | (() => Promise<GoalSourceResults>);
    isQueryBuilder?: boolean;
    segments: ScalarSegment[];
    series?: Series;
    width?: number;
  };

  function setup({
    goalSourceResults,
    isQueryBuilder = false,
    segments,
    series = createScalarSeries(),
    width = 230,
  }: SetupOpts) {
    if (goalSourceResults != null) {
      setupGoalSourceResultsEndpoint(goalSourceResults);
    }

    const onOpenChartSettings = jest.fn<void, [unknown]>();

    renderWithProviders(
      <Scalar
        {...mockedProps}
        actionButtons={<button>Download</button>}
        height={200}
        isQueryBuilder={isQueryBuilder}
        rawSeries={series}
        series={series}
        settings={{ ...settings, "scalar.segments": segments }}
        showTitle
        visualizationIsClickable={() => false}
        width={width}
        onOpenChartSettings={onOpenChartSettings}
      />,
    );

    return { onOpenChartSettings };
  }

  it("colors the value by the open-ended static range containing it", async () => {
    setup({
      segments: [
        { min: null, max: 100, color: "red", label: "low" },
        { min: 10000, max: null, color: "green", label: "high" },
      ],
    });

    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(getValueColor()).toBe("green");

    await userEvent.hover(screen.getByTestId("scalar-value"));
    expect(await screen.findByText("≥ 10,000")).toBeInTheDocument();
    expect(screen.getByText("≤ 100")).toBeInTheDocument();
  });

  it("colors the value by a range bound read from its goal source", async () => {
    setup({
      goalSourceResults: createGoalSourceResults(10000),
      segments: [
        { min: GOAL_REF, max: null, color: "green", label: "above goal" },
      ],
    });

    await userEvent.hover(await screen.findByTestId("scalar-value"));
    expect(getValueColor()).toBe("green");
    expect(await screen.findByText("≥ 10,000")).toBeInTheDocument();
    expect(screen.getByText("above goal")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("formats a dynamic range bound like the value", async () => {
    setup({
      goalSourceResults: createGoalSourceResults(1234.56789),
      segments: [
        { min: GOAL_REF, max: null, color: "green", label: "above goal" },
      ],
    });

    await userEvent.hover(await screen.findByTestId("scalar-value"));
    expect(await screen.findByText("≥ 1,234.57")).toBeInTheDocument();
  });

  it("keeps the default color when the value misses the resolved range", async () => {
    setup({
      goalSourceResults: createGoalSourceResults(20000),
      segments: [
        { min: GOAL_REF, max: null, color: "green", label: "above goal" },
      ],
    });

    expect(await screen.findByTestId("scalar-value")).toBeInTheDocument();
    expect(getValueColor()).toBe(color("text-primary"));
  });

  it("shows a loader until the goal source is fetched, then colors the value", async () => {
    const response = defer<GoalSourceResults>();
    setup({
      goalSourceResults: () => response.promise,
      segments: [
        { min: GOAL_REF, max: null, color: "green", label: "above goal" },
      ],
    });

    expect(await screen.findByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("scalar-value")).not.toBeInTheDocument();
    expect(screen.getByTestId("scalar-title")).toHaveTextContent(
      "Scalar Title",
    );
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();

    response.resolve(createGoalSourceResults(10000));

    expect(await screen.findByText("12,345")).toBeInTheDocument();
    expect(getValueColor()).toBe("green");
  });

  it("renders the value with a warning in the query builder when a self-column range's cell is null", () => {
    setup({
      isQueryBuilder: true,
      segments: [
        { min: "count", max: null, color: "green", label: "above goal" },
      ],
      series: createScalarSeries({ rows: [[null]] }),
    });

    expect(screen.getByTestId("scalar-value")).toBeInTheDocument();
    expect(screen.getByLabelText("Goal warning")).toBeInTheDocument();
  });

  it("renders the value with a warning in the query builder when a self-column range's question returned no rows", () => {
    setup({
      isQueryBuilder: true,
      segments: [
        { min: "count", max: null, color: "green", label: "above goal" },
      ],
      series: createScalarSeries({ rows: [] }),
    });

    expect(screen.getByTestId("scalar-value")).toBeInTheDocument();
    expect(screen.getByLabelText("Goal warning")).toBeInTheDocument();
  });

  it("colors the value as if a bound that failed to load were unset, with a warning in the query builder", async () => {
    const { onOpenChartSettings } = setup({
      goalSourceResults: FAILED_GOAL_SOURCE_RESULTS,
      isQueryBuilder: true,
      segments: PARTLY_FAILED_SEGMENTS,
    });

    expect(await screen.findByText("12,345")).toBeInTheDocument();
    expect(getValueColor()).toBe("green");
    expect(screen.getByTestId("scalar-title")).toHaveTextContent(
      "Scalar Title",
    );

    await userEvent.hover(screen.getByLabelText("Goal warning"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Couldn't get some color range values. Click to open settings.",
    );

    await userEvent.click(screen.getByLabelText("Goal warning"));
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Conditional colors" },
    });
  });

  it("colors the value as if a bound were unset, with a warning in the query builder, when fetching the goal sources fails", async () => {
    setup({
      goalSourceResults: 500,
      isQueryBuilder: true,
      segments: PARTLY_FAILED_SEGMENTS,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(getValueColor()).toBe("green");
  });

  it("compacts a value that fits the card but not next to the warning", async () => {
    setup({
      goalSourceResults: FAILED_GOAL_SOURCE_RESULTS,
      isQueryBuilder: true,
      segments: PARTLY_FAILED_SEGMENTS,
      width: 180,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("12.3k")).toBeInTheDocument();
  });

  it("does not compact a value that fits the card without the warning", async () => {
    setup({
      goalSourceResults: FAILED_GOAL_SOURCE_RESULTS,
      segments: PARTLY_FAILED_SEGMENTS,
      width: 180,
    });

    expect(await screen.findByText("12,345")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });

  it("colors the value as if a bound that failed to load were unset, without a warning outside the query builder (metabase#85062)", async () => {
    setup({
      goalSourceResults: FAILED_GOAL_SOURCE_RESULTS,
      segments: PARTLY_FAILED_SEGMENTS,
    });

    expect(await screen.findByTestId("scalar-value")).toBeInTheDocument();
    expect(getValueColor()).toBe("green");
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });

  // a bound that failed to load counts as unset, like on a range left open
  const PARTLY_FAILED_SEGMENTS: ScalarSegment[] = [
    { min: 10000, max: GOAL_REF, color: "green", label: "high" },
    { min: GOAL_REF, max: null, color: "red", label: "low" },
  ];

  const FAILED_GOAL_SOURCE_RESULTS = createMockFailedGoalSourceResults({
    id: GOAL_REF.id,
    error: "boom",
  });

  function createScalarSeries(data: Partial<DatasetData> = {}): Series {
    return [
      createMockSingleSeries(createMockCard({ display: "scalar" }), {
        data: createMockDatasetData({
          cols: [createMockColumn({ name: "count" })],
          rows: [[12345]],
          ...data,
        }),
      }),
    ];
  }

  function createGoalSourceResults(goal: number): GoalSourceResults {
    return createMockGoalSourceResults({
      id: GOAL_REF.id,
      column: GOAL_REF.column,
      value: goal,
    });
  }

  function getValueColor() {
    return screen
      .getByTestId("scalar-value")
      .style.getPropertyValue("--scalar-value-color");
  }
});

describe("Scalar with multiple series", () => {
  const GOAL_REF = { type: "card", id: 9, column: "goal" } as const;

  beforeAll(() => loadVisualizationComponents(["bar", "scalar"]));

  afterEach(() => {
    jest.useRealTimers();
  });

  async function setup({ segments }: { segments: ScalarSegment[] }) {
    const rawSeries = ["Orders", "Reviews"].map((name) =>
      createMockSingleSeries(
        createMockCard({
          name,
          display: "scalar",
          visualization_settings: { "scalar.segments": segments },
        }),
        {
          data: createMockDatasetData({
            cols: [
              createMockColumn({ name: "count", base_type: "type/Integer" }),
            ],
            rows: [[12345]],
          }),
        },
      ),
    );

    jest.useFakeTimers();
    renderWithProviders(<Visualization rawSeries={rawSeries} />);
    // ExplicitSize sets the chart dimensions after mounting
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
  }

  it("draws the bar chart without fetching a range bound's goal source", async () => {
    await setup({
      segments: [
        { min: GOAL_REF, max: null, color: "green", label: "above goal" },
      ],
    });

    expect(screen.getAllByText("Orders").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/dynamic-goal/values"),
    ).toHaveLength(0);
  });
});

describe("Scalar value font size (#85061)", () => {
  const LONG_SUFFIX = " active users this quarter";
  const NUMBER_COLUMN = createMockColumn({
    name: "count",
    base_type: "type/Integer",
  });
  const TEXT_COLUMN = createMockColumn({
    name: "count",
    base_type: "type/Text",
  });
  const DATE_TIME_COLUMN = createMockColumn({
    name: "last_updated",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
  });

  interface SetupOpts {
    column: DatasetColumn;
    value: RowValue;
    suffix?: string;
    timeEnabled?: "minutes";
  }

  const getValueFontSize = ({
    column,
    value,
    suffix,
    timeEnabled,
  }: SetupOpts) => {
    const rawSeries = [
      createMockSingleSeries(
        { display: "scalar" },
        { data: createMockDatasetData({ rows: [[value]], cols: [column] }) },
      ),
    ];
    const { unmount } = renderWithProviders(
      <Scalar
        {...mockedProps}
        series={rawSeries}
        rawSeries={rawSeries}
        settings={{
          ...settings,
          column: () => ({ suffix, time_enabled: timeEnabled }),
        }}
        visualizationIsClickable={() => false}
        width={230}
        height={150}
      />,
    );
    const { fontSize } = screen.getByTestId("scalar-value").style;
    unmount();
    return fontSize;
  };

  it("keeps the card font size for a number with a long suffix", () => {
    expect(
      getValueFontSize({
        column: NUMBER_COLUMN,
        value: 12345,
        suffix: LONG_SUFFIX,
      }),
    ).toBe(getValueFontSize({ column: NUMBER_COLUMN, value: 12345 }));
  });

  it("shrinks the font size for a long text value", () => {
    expect(
      getValueFontSize({
        column: TEXT_COLUMN,
        value: `12,345${LONG_SUFFIX}`,
      }),
    ).not.toBe(getValueFontSize({ column: NUMBER_COLUMN, value: 12345 }));
  });

  it("shrinks font size for date-time value that does not fit card (#86266)", () => {
    expect(
      getValueFontSize({
        column: DATE_TIME_COLUMN,
        value: "2029-04-19T14:07:00",
        timeEnabled: "minutes",
      }),
    ).not.toBe(getValueFontSize({ column: NUMBER_COLUMN, value: 12345 }));
  });
});

describe("scalar viz settings", () => {
  it("should render the field to show input in the formatting section if there are 2 or more columns", async () => {
    const series = [
      createMockSingleSeries(
        createMockCard({ display: "scalar" }),
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                display_name: "FOO",
                source: "native",
                name: "FOO",
              }),
              createMockColumn({
                display_name: "BAR",
                source: "native",
                name: "BAR",
              }),
            ],
          }),
        }),
      ),
    ];
    renderWithProviders(<QuestionChartSettings series={series} />);

    expect(
      await screen.findByRole("tab", { name: "Formatting" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Field to show")).toBeInTheDocument();

    const getFieldSelect = async () =>
      await within(
        await screen.findByTestId("chart-settings-widget-scalar.field"),
      ).findByRole("textbox");

    expect(await getFieldSelect()).toHaveDisplayValue("FOO");
    await userEvent.click(await getFieldSelect());

    expect(await screen.findByRole("listbox")).toHaveTextContent("FOO");
    expect(await screen.findByRole("listbox")).toHaveTextContent("BAR");
  });

  it("should not render the field to show input in the formatting section if there is only 1 columns", async () => {
    const series = [
      createMockSingleSeries(
        createMockCard({ display: "scalar" }),
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                display_name: "BAR",
                source: "native",
                name: "BAR",
              }),
            ],
          }),
        }),
      ),
    ];
    renderWithProviders(<QuestionChartSettings series={series} />);

    expect(
      await screen.findByRole("tab", { name: "Formatting" }),
    ).toHaveAttribute("aria-selected", "true");

    expect(
      screen.queryByTestId("chart-settings-widget-scalar.field"),
    ).not.toBeInTheDocument();
  });
});
