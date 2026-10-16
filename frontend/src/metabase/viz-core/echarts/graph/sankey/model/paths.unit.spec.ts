import { color } from "metabase/ui/colors";
import { getAccentColors } from "metabase/ui/colors/groups";
import type { RowValue } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getSankeyChartModel } from "./index";

type SetupOpts = {
  rows: RowValue[][];
  hasOutcome?: boolean;
};

const CONVERTED = "Converted";
const NOT_CONVERTED = "Didn't convert";

const setup = ({ rows, hasOutcome = false }: SetupOpts) => {
  const textColumn = (name: string) =>
    createMockColumn({ name, display_name: name, base_type: "type/Text" });
  const cols = [
    textColumn("source"),
    textColumn("target"),
    textColumn("source_label"),
    textColumn("target_label"),
    textColumn("target_kind"),
    ...(hasOutcome ? [textColumn("outcome")] : []),
    createMockColumn({
      name: "weight",
      display_name: "weight",
      base_type: "type/Integer",
    }),
  ];
  return getSankeyChartModel(
    [{ card: createMockCard(), data: createMockDatasetData({ cols, rows }) }],
    {
      "sankey.source": "source",
      "sankey.target": "target",
      "sankey.value": "weight",
      "product_analytics.paths": true,
      ...(hasOutcome && {
        "sankey.breakout": "outcome",
        "sankey.breakout_colors": {
          [CONVERTED]: color("success"),
          [NOT_CONVERTED]: color("error"),
        },
      }),
    },
  );
};

const nodeByKey = (
  model: ReturnType<typeof setup>,
  key: string,
): { displayName: RowValue; color: string } => {
  const node = model.data.nodes.find(({ rawName }) => rawName === key);
  if (node === undefined) {
    throw new Error(`No node ${key}`);
  }
  return { displayName: node.displayName, color: model.nodeColors[key] };
};

describe("getSankeyChartModel with product analytics paths", () => {
  it("labels nodes from the label columns, keeping their keys", () => {
    const model = setup({
      rows: [
        [
          "1. /pricing",
          "2. (dropped)",
          "/pricing",
          "Dropped off",
          "dropped",
          4,
        ],
      ],
    });

    expect(nodeByKey(model, "1. /pricing").displayName).toBe("/pricing");
    expect(nodeByKey(model, "2. (dropped)").displayName).toBe("Dropped off");
  });

  it("gives an event the same color at every step, and grouped and terminal nodes a neutral one", () => {
    const model = setup({
      rows: [
        ["1. /pricing", "2. /signup", "/pricing", "/signup", "step", 10],
        ["2. /signup", "3. /pricing", "/signup", "/pricing", "step", 6],
        ["2. /signup", "3. (other)", "/signup", "Other", "other", 2],
        ["2. /signup", "3. (dropped)", "/signup", "Dropped off", "dropped", 2],
      ],
    });

    const pricingColor = nodeByKey(model, "1. /pricing").color;
    expect(nodeByKey(model, "3. /pricing").color).toBe(pricingColor);
    expect(nodeByKey(model, "2. /signup").color).not.toBe(pricingColor);
    expect(nodeByKey(model, "3. (other)").color).toBe(color("text-tertiary"));
    expect(nodeByKey(model, "3. (dropped)").color).toBe(color("text-tertiary"));
    expect(model.data.links.every((link) => link.color === undefined)).toBe(
      true,
    );
  });

  it("splits links by outcome, labeling them where the tooltip reads them", () => {
    const model = setup({
      hasOutcome: true,
      rows: [
        [
          "1. Viewed pricing",
          "2. /signup",
          "Viewed pricing",
          "/signup",
          "step",
          CONVERTED,
          3,
        ],
        [
          "1. Viewed pricing",
          "2. /signup",
          "Viewed pricing",
          "/signup",
          "step",
          NOT_CONVERTED,
          7,
        ],
        [
          "2. /signup",
          "3. (converted) Purchased",
          "/signup",
          "Purchased",
          "converted",
          CONVERTED,
          3,
        ],
        [
          "2. /signup",
          "3. (dropped)",
          "/signup",
          "(Dropped off)",
          "dropped",
          NOT_CONVERTED,
          7,
        ],
      ],
    });

    const startNode = model.data.nodes.find(
      ({ rawName }) => rawName === "1. Viewed pricing",
    );
    const signupLinks = [...(startNode?.outputLinkByTarget.values() ?? [])];
    expect(
      signupLinks.map(({ value, color: linkColor, label }) => ({
        value,
        color: linkColor,
        label,
      })),
    ).toEqual([
      { value: 3, color: color("success"), label: CONVERTED },
      { value: 7, color: color("error"), label: NOT_CONVERTED },
    ]);
    expect(nodeByKey(model, "2. /signup").color).toBe(color("text-tertiary"));
    expect(nodeByKey(model, "3. (converted) Purchased")).toEqual({
      displayName: "Purchased",
      color: color("success"),
    });
    expect(nodeByKey(model, "3. (dropped)").color).toBe(color("error"));
  });

  it("colors a few events repeated over many steps from the main palette", () => {
    const events = ["/", "/pricing", "/signup", "/app"];
    const rows = Array.from({ length: 6 }, (_, step) =>
      events.map((event, index): RowValue[] => {
        const next = events[(index + 1) % events.length];
        return [
          `${step + 1}. ${event}`,
          `${step + 2}. ${next}`,
          event,
          next,
          "step",
          1,
        ];
      }),
    ).flat();
    const model = setup({ rows });

    const mainColors = getAccentColors({
      light: false,
      dark: false,
      gray: false,
    });
    const colors = Object.values(model.nodeColors);
    expect(colors.every((nodeColor) => mainColors.includes(nodeColor))).toBe(
      true,
    );
    expect(new Set(colors).size).toBe(events.length);
  });

  it("orders each column with outcomes at the edges and events by where they come from", () => {
    const model = setup({
      hasOutcome: true,
      rows: [
        [
          "1. /",
          "2. (dropped)",
          "/",
          "(Dropped off)",
          "dropped",
          NOT_CONVERTED,
          50,
        ],
        ["1. /", "2. /app", "/", "/app", "step", NOT_CONVERTED, 10],
        [
          "1. /pricing",
          "2. (converted) Purchased",
          "/pricing",
          "Purchased",
          "converted",
          CONVERTED,
          2,
        ],
        [
          "1. /pricing",
          "2. /signup",
          "/pricing",
          "/signup",
          "step",
          NOT_CONVERTED,
          40,
        ],
        ["1. /", "2. (other)", "/", "(Other)", "other", NOT_CONVERTED, 30],
      ],
    });

    expect(model.keepsNodeOrder).toBe(true);
    expect(model.data.nodes.map(({ rawName }) => rawName)).toEqual([
      "1. /",
      "1. /pricing",
      "2. (converted) Purchased",
      "2. /app",
      "2. /signup",
      "2. (other)",
      "2. (dropped)",
    ]);
  });
});
