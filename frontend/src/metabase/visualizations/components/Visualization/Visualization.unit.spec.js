import { renderWithProviders, screen } from "__support__/ui";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { color } from "metabase/lib/colors";
import { delay } from "metabase/lib/promise";
import Visualization from "metabase/visualizations/components/Visualization";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard } from "metabase-types/api/mocks";

registerVisualizations();

describe("Visualization", () => {
  const renderViz = async series => {
    renderWithProviders(<Visualization rawSeries={series} />);
    // The chart isn't rendered until the next tick. This is due to ExplicitSize
    // not setting the dimensions until after mounting.
    await delay(0);
  };

  const chartPathsWithColor = color => {
    const container = screen.getByTestId("chart-container");
    return container.querySelectorAll(`path[fill="${color}"]`);
  };

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
