import {
  type ClickAction,
  type ClickObject,
  isCustomClickAction,
} from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";
import { createMockColumn } from "metabase-types/api/mocks";

import type { Grain } from "../analyses/types";

import { getDrillMode } from "./drill-mode";

const PERIODS_REF: ["field", string, { "base-type": string }] = [
  "field",
  "periods",
  { "base-type": "type/Integer" },
];
const PERIODS_COLUMN = createMockColumn({
  name: "periods",
  field_ref: PERIODS_REF,
});
const PEOPLE_COLUMN = createMockColumn({ name: "people" });

const BAR_CLICK: ClickObject = {
  column: PEOPLE_COLUMN,
  value: 120,
  dimensions: [{ column: PERIODS_COLUMN, value: 6 }],
};

const BAR_DRILL: Lib.AnalysisDrill = {
  type: "actors",
  dimensions: [{ column_ref: PERIODS_REF, value: 6 }],
};

type SetupOpts = {
  counting?: Grain;
  label?: string | null;
};

const setup = ({
  counting = "person",
  label = "People active on 6 days",
}: SetupOpts = {}) => {
  const describeDrill = jest.fn<string | null, [Lib.AnalysisDrill]>(
    () => label,
  );
  const onDrill = jest.fn<void, [Lib.AnalysisDrill]>();
  const mode = getDrillMode({ counting, describeDrill, onDrill });
  return { mode, describeDrill, onDrill };
};

const getTitles = (actions: ClickAction[]) =>
  actions.map((action) =>
    isCustomClickAction(action) ? action.title : undefined,
  );

describe("getDrillMode", () => {
  it("offers to see the people in a clicked cell, and drills to them", () => {
    const { mode, onDrill } = setup();
    const closePopover = jest.fn();

    const actions = mode.actionsForClick(BAR_CLICK);

    expect(getTitles(actions)).toEqual(["See these people"]);
    const [action] = actions;
    if (!isCustomClickAction(action)) {
      throw new Error("Expected a custom click action");
    }
    action.onClick?.({ dispatch: jest.fn(), closePopover });
    expect(closePopover).toHaveBeenCalledTimes(1);
    expect(onDrill).toHaveBeenCalledTimes(1);
    expect(onDrill).toHaveBeenCalledWith(BAR_DRILL);
  });

  it("names what the analysis counts", () => {
    const { mode } = setup({ counting: "session" });

    expect(getTitles(mode.actionsForClick(BAR_CLICK))).toEqual([
      "See these sessions",
    ]);
  });

  it("offers nothing for a cell the analysis can't describe", () => {
    const { mode, describeDrill } = setup({ label: null });

    expect(mode.actionsForClick(BAR_CLICK)).toEqual([]);
    expect(describeDrill).toHaveBeenCalledWith(BAR_DRILL);
  });

  it("offers nothing for a click that isn't on a cell", () => {
    const { mode } = setup();

    expect(mode.actionsForClick({ column: PEOPLE_COLUMN, value: 120 })).toEqual(
      [],
    );
  });
});
