import type { ComponentProps } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { Series } from "metabase-types/api";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";

import { ResponseDistribution } from "./ResponseDistribution";

const createMockSeries = (rows: (string | number | boolean)[][]): Series => [
  {
    card: createMockCard({ display: "response_distribution" }),
    data: {
      cols: [
        createMockColumn({
          name: "question_title",
          display_name: "Question Title",
          base_type: "type/Text",
          source: "breakout",
        }),
        createMockColumn({
          name: "option_text",
          display_name: "Option Text",
          base_type: "type/Text",
          source: "breakout",
        }),
        createMockColumn({
          name: "option_weight",
          display_name: "Weight",
          base_type: "type/Number",
          source: "breakout",
        }),
        createMockColumn({
          name: "response_count",
          display_name: "Count",
          base_type: "type/Number",
          source: "breakout",
        }),
        createMockColumn({
          name: "total_responses",
          display_name: "Total",
          base_type: "type/Number",
          source: "breakout",
        }),
        createMockColumn({
          name: "is_cna",
          display_name: "Is CNA",
          base_type: "type/Boolean",
          source: "breakout",
        }),
        createMockColumn({
          name: "option_order",
          display_name: "Order",
          base_type: "type/Number",
          source: "breakout",
        }),
      ],
      rows,
      native_form: {
        query: "",
      },
      results_metadata: { columns: [] },
      rows_truncated: 0,
    },
  },
];

const defaultSettings = {
  "response_distribution.question_title_column": "question_title",
  "response_distribution.option_text_column": "option_text",
  "response_distribution.option_weight_column": "option_weight",
  "response_distribution.response_count_column": "response_count",
  "response_distribution.total_responses_column": "total_responses",
  "response_distribution.is_cna_column": "is_cna",
  "response_distribution.use_custom_order": false,
  "response_distribution.option_order_column": "option_order",
};

const mockedProps = {} as ComponentProps<typeof ResponseDistribution>;

describe("ResponseDistribution", () => {
  it("should render the question title from specified column", () => {
    const rows = [
      ["Test Question", "Option A", 100, 5, 10, false, 1],
      ["Test Question", "Option B", 50, 5, 10, false, 2],
    ];

    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries(rows)}
        settings={defaultSettings}
      />,
    );

    // The title should be from the question_title column
    expect(screen.getByText("Test Question")).toBeInTheDocument();
  });

  it("should display the overall score badge", () => {
    const rows = [
      ["Test Question", "Option A", 100, 2, 10, false, 1],
      ["Test Question", "Option B", 80, 3, 10, false, 2],
      ["Test Question", "CNA", 0, 5, 10, true, 3],
    ];

    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries(rows)}
        settings={defaultSettings}
      />,
    );

    // Score should be (100*2 + 80*3) / 5 = 88
    expect(screen.getByText("88.00")).toBeInTheDocument();
  });

  it("should render legend items with correct text and stats", () => {
    const rows = [
      ["Test Question", "Strongly Agree", 100, 2, 10, false, 1],
      ["Test Question", "Agree", 80, 3, 10, false, 2],
      ["Test Question", "CNA", 0, 5, 10, true, 3],
    ];

    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries(rows)}
        settings={defaultSettings}
      />,
    );

    // Check that options appear in legend
    expect(screen.getByText("Strongly Agree")).toBeInTheDocument();
    expect(screen.getByText("Agree")).toBeInTheDocument();
    expect(screen.getByText("CNA")).toBeInTheDocument();

    // Check percentages and counts
    expect(screen.getByText("20% (2)")).toBeInTheDocument();
    expect(screen.getByText("30% (3)")).toBeInTheDocument();
    expect(screen.getByText("50% (5)")).toBeInTheDocument();
  });

  it("should show empty state when no data", () => {
    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries([])}
        settings={defaultSettings}
      />,
    );

    expect(screen.getByText(/No data to display/i)).toBeInTheDocument();
  });

  it("should render segmented bar with options", () => {
    const rows = [
      ["Test Question", "Option A", 100, 5, 10, false, 1],
      ["Test Question", "Option B", 50, 5, 10, false, 2],
    ];

    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries(rows)}
        settings={defaultSettings}
      />,
    );

    // Check that options appear in legend
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("should not display title when title column is not specified", () => {
    const rows = [["", "Option A", 100, 10, 10, false, 1]];
    const {
      "response_distribution.question_title_column": _removed,
      ...settingsWithoutTitle
    } = defaultSettings;

    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries(rows)}
        settings={settingsWithoutTitle}
      />,
    );

    // Title should not appear, but option text should appear in legend
    expect(screen.getByText("Option A")).toBeInTheDocument();
    // Verify no h3 element is rendered (by checking there's only one "Option A" in the legend)
    expect(screen.getAllByText("Option A")).toHaveLength(1);
  });

  it("should render all options including CNA", () => {
    const rows = [
      ["Test Question", "Low", 50, 1, 10, false, 1],
      ["Test Question", "Medium", 85, 1, 10, false, 2],
      ["Test Question", "High", 95, 1, 10, false, 3],
      ["Test Question", "CNA", 0, 7, 10, true, 4],
    ];

    renderWithProviders(
      <ResponseDistribution
        {...mockedProps}
        rawSeries={createMockSeries(rows)}
        settings={defaultSettings}
      />,
    );

    // Check that all options appear in legend
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("CNA")).toBeInTheDocument();
  });
});
