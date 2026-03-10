import type { ComponentProps } from "react";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { delay } from "__support__/utils";
import { color } from "metabase/lib/colors";
import { registerVisualization } from "metabase/visualizations";
import VisualizationComponent from "metabase/visualizations/components/Visualization";
import registerVisualizations from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  RawSeries,
  Settings,
  VisualizationDisplay,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSettings,
  createMockTokenFeatures,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

registerVisualizations();

const MOCK_DISPLAY = "mocked-visualization" as VisualizationDisplay;

const MockedVisualization = Object.assign(
  ({ onRenderError }: Pick<VisualizationProps, "onRenderError">) => {
    onRenderError("This is an error message");

    return <div>Hello, I am mocked</div>;
  },
  {
    getUiName: () => "Mocked Visualization",
    identifier: MOCK_DISPLAY,
    iconName: "unknown" as const,
    noHeader: true,
    minSize: { width: 1, height: 1 },
    defaultSize: { width: 4, height: 4 },
    settings: {},
    isSensible: () => false,
    checkRenderable: () => undefined,
  },
);

registerVisualization(MockedVisualization);

describe("Visualization", () => {
  const renderViz = async (
    series: RawSeries | undefined,
    props: Omit<
      Partial<ComponentProps<typeof VisualizationComponent>>,
      "rawSeries"
    > = {},
    settings?: Settings,
  ) => {
    const storeInitialState = createMockState({
      settings: mockSettings(settings),
    });

    renderWithProviders(
      <VisualizationComponent rawSeries={series} {...props} />,
      {
        storeInitialState,
      },
    );
    // The chart isn't rendered until the next tick. This is due to ExplicitSize
    // not setting the dimensions until after mounting.
    await delay(0);
  };

  const chartPathsWithColor = (
    fillColor: string,
  ): NodeListOf<SVGPathElement> => {
    const container = screen.getByTestId("chart-container");
    return container.querySelectorAll<SVGPathElement>(
      `path[fill="${fillColor}"]`,
    );
  };

  describe("with an error", () => {
    it("should render the error message and the proper title (metabase#49348)", async () => {
      await renderViz(
        [
          {
            data: {
              ...createMockDatasetData({
                cols: [
                  createMockCategoryColumn({ name: "CATEGORY" }),
                  createMockCategoryColumn({ name: "VENDOR" }),
                  createMockNumericColumn({ name: "count" }),
                ],
                rows: [
                  ["Doohickey", "Annetta Wyman and Sons", 1],
                  ["Doohickey", "Balistreri-Ankunding", 1],
                  ["Doohickey", "Bernhard-Grady", 1],
                ],
              }),
            },
            card: createMockCard({
              name: "Products, Count, Grouped by Category and Vendor",
              display: MOCK_DISPLAY,
              visualization_settings: createMockVisualizationSettings({
                "graph.dimensions": ["CATEGORY", "VENDOR"],
                "graph.metrics": ["count"],
              }),
            }),
          },
        ],
        {
          showTitle: true,
          isDashboard: true,
        },
      );

      expect(screen.getByText("This is an error message")).toBeInTheDocument();
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Products, Count, Grouped by Category and Vendor",
      );
    });
  });

  it("should render a watermark when in development mode", async () => {
    await renderViz(
      [
        {
          card: createMockCard({ name: "Card", display: "bar" }),
          data: createMockDatasetData({
            cols: [
              createMockCategoryColumn({ name: "Dimension" }),
              createMockNumericColumn({ name: "Count" }),
            ],
            rows: [
              ["foo", 1],
              ["bar", 2],
            ],
          }),
        },
      ],
      {},
      createMockSettings({
        "token-features": createMockTokenFeatures({
          development_mode: true,
        }),
      }),
    );

    expect(
      await screen.findByTestId("development-watermark"),
    ).toBeInTheDocument();
  });

  describe("scalar", () => {
    it("should render", async () => {
      await renderViz([
        {
          card: createMockCard({ display: "scalar" }),
          data: createMockDatasetData({
            cols: [createMockNumericColumn({ name: "Count" })],
            rows: [[1]],
          }),
        },
      ]);

      expect(screen.getByTestId("scalar-value")).toHaveTextContent("1");
    });
  });

  describe("bar", () => {
    describe("single series", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: createMockCard({ name: "Card", display: "bar" }),
            data: createMockDatasetData({
              cols: [
                createMockCategoryColumn({ name: "Dimension" }),
                createMockNumericColumn({ name: "Count" }),
              ],
              rows: [
                ["foo", 1],
                ["bar", 2],
              ],
            }),
          },
        ]);

        expect(chartPathsWithColor(color("accent0"))).toHaveLength(2);
      });
    });

    describe("multiseries: multiple metrics", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: createMockCard({ name: "Card", display: "bar" }),
            data: createMockDatasetData({
              cols: [
                createMockCategoryColumn({ name: "Dimension" }),
                createMockNumericColumn({ name: "Count" }),
                createMockNumericColumn({ name: "Sum" }),
              ],
              rows: [
                ["foo", 1, 3],
                ["bar", 2, 4],
              ],
            }),
          },
        ]);

        expect(chartPathsWithColor(color("accent0"))).toHaveLength(2); // "count"
        expect(chartPathsWithColor(color("accent1"))).toHaveLength(2); // "sum"
      });
    });

    describe("multiseries: multiple breakouts", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: createMockCard({ name: "Card", display: "bar" }),
            data: createMockDatasetData({
              cols: [
                createMockCategoryColumn({ name: "Dimension1" }),
                createMockCategoryColumn({ name: "Dimension2" }),
                createMockNumericColumn({ name: "Count" }),
              ],
              rows: [
                ["foo", "a", 1],
                ["bar", "a", 2],
                ["foo", "b", 1],
                ["bar", "b", 2],
              ],
            }),
          },
        ]);

        expect(chartPathsWithColor(color("accent1"))).toHaveLength(2); // "a"
        expect(chartPathsWithColor(color("accent2"))).toHaveLength(2); // "b"
      });
    });

    describe("multiseries: dashcard", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: createMockCard({ id: 1, name: "Card1", display: "bar" }),
            data: createMockDatasetData({
              cols: [
                createMockCategoryColumn({ id: 1, name: "Dimension" }),
                createMockNumericColumn({ id: 2, name: "Count" }),
              ],
              rows: [
                ["foo", 1],
                ["bar", 2],
              ],
            }),
          },
          {
            card: createMockCard({ id: 2, name: "Card2", display: "bar" }),
            data: createMockDatasetData({
              cols: [
                createMockCategoryColumn({ id: 1, name: "Dimension" }),
                createMockNumericColumn({ id: 2, name: "Count" }),
              ],
              rows: [
                ["foo", 3],
                ["bar", 4],
              ],
            }),
          },
        ]);

        expect(chartPathsWithColor(color("accent0"))).toHaveLength(2); // "count"
        expect(chartPathsWithColor(color("accent2"))).toHaveLength(2); // "Card2"
      });
    });
  });

  it("should not show loader and error at the same time (metabase#63410)", async () => {
    await renderViz(undefined, {
      error: "This is my error message",
      isRunning: true,
    });

    expect(
      screen.queryByText("This is my error message"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });
});
