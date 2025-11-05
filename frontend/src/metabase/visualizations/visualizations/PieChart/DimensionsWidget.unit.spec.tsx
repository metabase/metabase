import { render, screen } from "__support__/ui";
import {
  createMockCategoryColumn,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { DimensionsWidget } from "./DimensionsWidget";

const mockRawSeries = [
  createMockSingleSeries(
    {
      id: 1,
      name: "Test Card",
      display: "pie",
    },
    {
      data: {
        cols: [
          createMockCategoryColumn({ id: 1, name: "category" }),
          createMockCategoryColumn({ id: 2, name: "category2" }),
          createMockNumericColumn({ id: 3, name: "metric" }),
        ],
        rows: [],
      },
    },
  ),
];

const defaultProps = {
  rawSeries: mockRawSeries,
  onChangeSettings: jest.fn(),
  onShowWidget: jest.fn(),
};

describe("DimensionsWidget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should show 'Breakout' label for single dimension", () => {
    const settings = {
      "pie.dimension": ["category"],
    };

    render(<DimensionsWidget {...defaultProps} settings={settings} />);

    expect(screen.getByText("Breakout")).toBeInTheDocument();
    expect(screen.queryByText("Inner Ring")).not.toBeInTheDocument();
  });

  it("should show 'Inner Ring' and 'Outer Ring' labels for two dimensions", () => {
    const settings = {
      "pie.dimension": ["category", "category2"],
    };

    render(<DimensionsWidget {...defaultProps} settings={settings} />);

    expect(screen.getByText("Inner Ring")).toBeInTheDocument();
    expect(screen.getByText("Outer Ring")).toBeInTheDocument();
    expect(screen.queryByText("Breakout")).not.toBeInTheDocument();
  });

  it("should show 'Inner Ring', 'Middle Ring', and 'Outer Ring' labels for three dimensions", () => {
    const mockRawSeriesWithThreeDimensions = [
      createMockSingleSeries(
        {
          id: 1,
          name: "Test Card",
          display: "pie",
        },
        {
          data: {
            cols: [
              createMockCategoryColumn({ id: 1, name: "category" }),
              createMockCategoryColumn({ id: 2, name: "category2" }),
              createMockCategoryColumn({ id: 4, name: "category3" }),
              createMockNumericColumn({ id: 3, name: "metric" }),
            ],
            rows: [],
          },
        },
      ),
    ];

    const settings = {
      "pie.dimension": ["category", "category2", "category3"],
    };

    render(
      <DimensionsWidget
        {...defaultProps}
        rawSeries={mockRawSeriesWithThreeDimensions}
        settings={settings}
      />,
    );

    expect(screen.getByText("Inner Ring")).toBeInTheDocument();
    expect(screen.getByText("Middle Ring")).toBeInTheDocument();
    expect(screen.getByText("Outer Ring")).toBeInTheDocument();
    expect(screen.queryByText("Breakout")).not.toBeInTheDocument();
  });
});
