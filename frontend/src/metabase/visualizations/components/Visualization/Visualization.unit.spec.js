import PropTypes from "prop-types";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { delay } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { color } from "metabase/lib/colors";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

registerVisualizations();

const MockedVisualization = (props) => {
  props.onRenderError("This is an error message");

  return <div>Hello, I am mocked</div>;
};
MockedVisualization.getUiName = () => "Mocked Visualization";

MockedVisualization.propTypes = {
  onRenderError: PropTypes.func.isRequired,
};

Object.assign(MockedVisualization, {
  identifier: "mocked-visualization",
  noHeader: true,
  supportsSeries: true,
});

registerVisualization(MockedVisualization);

describe("Visualization", () => {
  const renderViz = async (series, props = {}, settings) => {
    const storeInitialState = createMockState({
      settings: mockSettings(settings),
    });

    await renderWithProviders(<Visualization rawSeries={series} {...props} />, {
      storeInitialState,
    });
    // The chart isn't rendered until the next tick. This is due to ExplicitSize
    // not setting the dimensions until after mounting.
    await delay(0);
  };

  const chartPathsWithColor = (color) => {
    const container = screen.getByTestId("chart-container");
    return container.querySelectorAll(`path[fill="${color}"]`);
  };

  describe("with an error", () => {
    it("should render the error message and the proper title (metabase#49348)", async () => {
      await renderViz(
        [
          {
            data: {
              rows: [
                ["Doohickey", "Annetta Wyman and Sons", 1],
                ["Doohickey", "Balistreri-Ankunding", 1],
                ["Doohickey", "Bernhard-Grady", 1],
              ],
              cols: [
                StringColumn({ name: "CATEGORY" }),
                StringColumn({ name: "VENDOR" }),
                NumberColumn({ name: "count" }),
              ],
            },
            card: createMockCard({
              name: "Products, Count, Grouped by Category and Vendor",
              display: "mocked-visualization",
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
          data: {
            cols: [
              StringColumn({ name: "Dimension" }),
              NumberColumn({ name: "Count" }),
            ],
            rows: [
              ["foo", 1],
              ["bar", 2],
            ],
          },
        },
      ],
      {},
      createMockSettings({
        "token-features": createMockTokenFeatures({
          "development-mode": true,
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
          data: { rows: [[1]], cols: [NumberColumn({ name: "Count" })] },
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
            data: {
              cols: [
                StringColumn({ name: "Dimension" }),
                NumberColumn({ name: "Count" }),
              ],
              rows: [
                ["foo", 1],
                ["bar", 2],
              ],
            },
          },
        ]);

        expect(chartPathsWithColor(color("brand"))).toHaveLength(2);
      });
    });

    describe("multiseries: multiple metrics", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: createMockCard({ name: "Card", display: "bar" }),
            data: {
              cols: [
                StringColumn({ name: "Dimension" }),
                NumberColumn({ name: "Count" }),
                NumberColumn({ name: "Sum" }),
              ],
              rows: [
                ["foo", 1, 3],
                ["bar", 2, 4],
              ],
            },
          },
        ]);

        expect(chartPathsWithColor(color("brand"))).toHaveLength(2); // "count"
        expect(chartPathsWithColor(color("accent1"))).toHaveLength(2); // "sum"
      });
    });

    describe("multiseries: multiple breakouts", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: createMockCard({ name: "Card", display: "bar" }),
            data: {
              cols: [
                StringColumn({ name: "Dimension1" }),
                StringColumn({ name: "Dimension2" }),
                NumberColumn({ name: "Count" }),
              ],
              rows: [
                ["foo", "a", 1],
                ["bar", "a", 2],
                ["foo", "b", 1],
                ["bar", "b", 2],
              ],
            },
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
            data: {
              cols: [
                StringColumn({ id: 1, name: "Dimension" }),
                NumberColumn({ id: 2, name: "Count" }),
              ],
              rows: [
                ["foo", 1],
                ["bar", 2],
              ],
            },
          },
          {
            card: createMockCard({ id: 2, name: "Card2", display: "bar" }),
            data: {
              cols: [
                StringColumn({ id: 1, name: "Dimension" }),
                NumberColumn({ id: 2, name: "Count" }),
              ],
              rows: [
                ["foo", 3],
                ["bar", 4],
              ],
            },
          },
        ]);

        expect(chartPathsWithColor(color("brand"))).toHaveLength(2); // "count"
        expect(chartPathsWithColor(color("accent2"))).toHaveLength(2); // "Card2"
      });
    });
  });
});
