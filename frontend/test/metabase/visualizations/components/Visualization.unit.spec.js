import React from "react";
import ReactDOM from "react-dom";

import {
  NumberColumn,
  StringColumn,
  createFixture,
  cleanupFixture,
} from "../__support__/visualizations";

import { delay } from "metabase/lib/promise";

import { color } from "metabase/lib/colors";
import Visualization from "metabase/visualizations/components/Visualization";

describe("Visualization", () => {
  // eslint-disable-next-line no-unused-vars
  let element, viz;
  const qs = s => element.querySelector(s);
  const qsa = s => [...element.querySelectorAll(s)];

  const renderViz = async series => {
    ReactDOM.render(
      <Visualization ref={ref => (viz = ref)} rawSeries={series} />,
      element,
    );
    // The chart isn't rendered until the next tick. This is due to ExplicitSize
    // not setting the dimensions until after mounting.
    await delay(0);
  };

  beforeEach(() => {
    element = createFixture();
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(element);
    cleanupFixture(element);
  });

  describe("scalar", () => {
    it("should render", async () => {
      await renderViz([
        {
          card: { display: "scalar" },
          data: { rows: [[1]], cols: [NumberColumn({ name: "Count" })] },
        },
      ]);
      expect(qs("h1").textContent).toEqual("1");
    });
  });

  describe("bar", () => {
    const getBarColors = () => qsa(".bar").map(bar => bar.getAttribute("fill"));
    describe("single series", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: { name: "Card", display: "bar" },
            data: {
              cols: [
                StringColumn({ name: "Dimension" }),
                NumberColumn({ name: "Count" }),
              ],
              rows: [["foo", 1], ["bar", 2]],
            },
          },
        ]);
        expect(getBarColors()).toEqual([
          color("brand"), // "count"
          color("brand"), // "count"
        ]);
      });
    });
    describe("multiseries: multiple metrics", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: { name: "Card", display: "bar" },
            data: {
              cols: [
                StringColumn({ name: "Dimension" }),
                NumberColumn({ name: "Count" }),
                NumberColumn({ name: "Sum" }),
              ],
              rows: [["foo", 1, 3], ["bar", 2, 4]],
            },
          },
        ]);
        expect(getBarColors()).toEqual([
          color("brand"), // "count"
          color("brand"), // "count"
          color("accent1"), // "sum"
          color("accent1"), // "sum"
        ]);
      });
    });
    describe("multiseries: multiple breakouts", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: { name: "Card", display: "bar" },
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
        expect(getBarColors()).toEqual([
          color("accent1"), // "a"
          color("accent1"), // "a"
          color("accent2"), // "b"
          color("accent2"), // "b"
        ]);
      });
    });
    describe("multiseries: dashcard", () => {
      it("should have correct colors", async () => {
        await renderViz([
          {
            card: { name: "Card1", display: "bar" },
            data: {
              cols: [
                StringColumn({ name: "Dimension" }),
                NumberColumn({ name: "Count" }),
              ],
              rows: [["foo", 1], ["bar", 2]],
            },
          },
          {
            card: { name: "Card2", display: "bar" },
            data: {
              cols: [
                StringColumn({ name: "Dimension" }),
                NumberColumn({ name: "Count" }),
              ],
              rows: [["foo", 3], ["bar", 4]],
            },
          },
        ]);
        expect(getBarColors()).toEqual([
          color("brand"), // "count"
          color("brand"), // "count"
          color("accent2"), // "Card2"
          color("accent2"), // "Card2"
        ]);
      });
    });
  });
});
