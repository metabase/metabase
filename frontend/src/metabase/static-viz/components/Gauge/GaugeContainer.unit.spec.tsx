import ReactDOMServer from "react-dom/server";

import { createColorGetter } from "metabase/static-viz/lib/colors";
import type { GoalData } from "metabase/visualizations/lib/dynamic-goals";
import type { GoalSegment } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import GaugeContainer from "./GaugeContainer";

const getColor = createColorGetter();

const COUNT_COL = createMockColumn({
  name: "count",
  base_type: "type/Integer",
});
const GOAL_COL = createMockColumn({ name: "goal", base_type: "type/Integer" });

const DATA: GoalData = { cols: [COUNT_COL], rows: [[42]] };

const GREEN = "#84BB4C";
const RED = "#ED6E6E";

type SetupOpts = {
  data?: GoalData;
  segments?: GoalSegment[];
};

function setup({ data = DATA, segments }: SetupOpts = {}) {
  const root = document.createElement("div");
  root.innerHTML = ReactDOMServer.renderToStaticMarkup(
    <GaugeContainer
      card={{ visualization_settings: { "gauge.segments": segments } }}
      data={data}
      getColor={getColor}
    />,
  );
  return root;
}

describe("GaugeContainer", () => {
  it("renders static segments with their colors and labels", () => {
    const root = setup({
      segments: [
        { min: 0, max: 50, color: RED, label: "Low" },
        { min: 50, max: 100, color: GREEN, label: "High" },
      ],
    });

    expect(getSegmentFills(root)).toEqual([RED, GREEN]);
    expect(root).toHaveTextContent("Low");
    expect(root).toHaveTextContent("High");
  });

  it("resolves a reference to another column of the same query", () => {
    const root = setup({
      data: { cols: [COUNT_COL, GOAL_COL], rows: [[10, 250]] },
      segments: [{ min: 0, max: "goal", color: GREEN }],
    });

    expect(getSegmentFills(root)).toEqual([GREEN]);
    expect(root).toHaveTextContent("250");
  });

  it("resolves a reference to another entity's column from referenced_entities", () => {
    const root = setup({
      data: {
        ...DATA,
        referenced_entities: {
          card: {
            9: {
              status: "completed",
              data: { cols: [GOAL_COL], rows: [[250]] },
            },
          },
        },
      },
      segments: [
        { min: 0, max: { type: "card", id: 9, column: "goal" }, color: GREEN },
      ],
    });

    expect(getSegmentFills(root)).toEqual([GREEN]);
    expect(root).toHaveTextContent("250");
  });

  it("fills a legacy segment without a color with the static text-secondary color", () => {
    const root = setup({ segments: [{ min: 0, max: 100 }] });
    const [fill] = getSegmentFills(root);

    expect(fill).toMatch(/^#[0-9A-F]{6}$/i);
    expect(fill?.toUpperCase()).toBe(getColor("text-secondary").toUpperCase());
  });

  it("drops a segment with a missing bound", () => {
    const root = setup({
      segments: [
        { min: null, max: 50, color: RED },
        { min: 0, max: 100, color: GREEN },
      ],
    });

    expect(getSegmentFills(root)).toEqual([GREEN]);
  });

  it("spans the range across overlapping segments", () => {
    const outer = { min: 0, max: 100, color: RED };
    const alone = setup({ segments: [outer] });
    const overlapped = setup({
      segments: [outer, { min: 50, max: 60, color: GREEN }],
    });

    const [outerPath] = getSegmentPaths(alone);
    const needleTransform = getNeedleTransform(alone);

    expect(outerPath).toEqual(expect.any(String));
    expect(needleTransform).toEqual(expect.stringContaining("rotate("));
    expect(getSegmentFills(overlapped)).toEqual([RED, GREEN]);
    expect(getSegmentPaths(overlapped)[0]).toBe(outerPath);
    expect(getNeedleTransform(overlapped)).toBe(needleTransform);
  });

  describe("unresolvable segments", () => {
    it("throws for a reference nothing has answered yet", () => {
      expect(() =>
        setup({
          segments: [
            {
              min: 0,
              max: { type: "card", id: 9, column: "goal" },
              color: GREEN,
            },
          ],
        }),
      ).toThrow("Couldn't resolve one of this gauge's ranges");
    });

    it("throws for a reference whose query failed", () => {
      expect(() =>
        setup({
          data: {
            ...DATA,
            referenced_entities: {
              card: { 9: { status: "failed", error: "boom" } },
            },
          },
          segments: [
            {
              min: 0,
              max: { type: "card", id: 9, column: "goal" },
              color: GREEN,
            },
          ],
        }),
      ).toThrow("Couldn't resolve one of this gauge's ranges");
    });

    it("throws for a referenced column that does not exist", () => {
      expect(() =>
        setup({
          data: {
            ...DATA,
            referenced_entities: {
              card: {
                9: {
                  status: "completed",
                  data: { cols: [GOAL_COL], rows: [[250]] },
                },
              },
            },
          },
          segments: [
            {
              min: 0,
              max: { type: "card", id: 9, column: "missing" },
              color: GREEN,
            },
          ],
        }),
      ).toThrow("Couldn't resolve one of this gauge's ranges");
    });

    it("throws for a self-column reference that does not exist", () => {
      expect(() =>
        setup({ segments: [{ min: 0, max: "missing", color: GREEN }] }),
      ).toThrow("Couldn't resolve one of this gauge's ranges");
    });

    it("throws for a self-column reference that is not a number", () => {
      expect(() =>
        setup({
          data: { cols: [COUNT_COL, GOAL_COL], rows: [[10, null]] },
          segments: [{ min: 0, max: "goal", color: GREEN }],
        }),
      ).toThrow("Couldn't resolve one of this gauge's ranges");
    });

    it("throws when no segment has both bounds", () => {
      expect(() =>
        setup({ segments: [{ min: null, max: null, color: GREEN }] }),
      ).toThrow("Gauge has no valid ranges");
      expect(() => setup()).toThrow("Gauge has no valid ranges");
    });
  });
});

function getSegmentArcs(root: HTMLElement) {
  // the first arc is the full-range background arc
  const [, ...arcs] = Array.from(
    root.querySelectorAll(".visx-pie-arcs-group path"),
  );
  return arcs;
}

function getSegmentFills(root: HTMLElement) {
  return getSegmentArcs(root).map((arc) => arc.getAttribute("fill"));
}

function getSegmentPaths(root: HTMLElement) {
  return getSegmentArcs(root).map((arc) => arc.getAttribute("d"));
}

function getNeedleTransform(root: HTMLElement) {
  return root
    .querySelector('g[transform^="rotate("]')
    ?.getAttribute("transform");
}
