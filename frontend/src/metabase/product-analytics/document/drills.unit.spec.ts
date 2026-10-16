import type {
  ProductAnalyticsNodeDefinition,
  RowValue,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { createMockEventDefinition } from "../events/mocks";
import type { EventDefinition } from "../events/types";

import { getDocumentDrillsMode } from "./drills";

const SIGNED_UP = createMockEventDefinition({ name: "Signed up" });
const PURCHASED = createMockEventDefinition({ name: "Purchased" });

type SetupOpts = {
  funnelSteps?: EventDefinition[];
  label: RowValue;
};

const setup = ({ funnelSteps, label }: SetupOpts) => {
  const onInsertBelow = jest.fn<void, [ProductAnalyticsNodeDefinition]>();
  const mode = getDocumentDrillsMode({ funnelSteps, onInsertBelow });
  const actions =
    mode.actionsForClick?.(
      {
        dimensions: [
          { column: createMockColumn({ name: "label" }), value: label },
        ],
      },
      {},
    ) ?? [];
  return { actions, onInsertBelow };
};

describe("getDocumentDrillsMode", () => {
  it("adds paths from the clicked funnel step below the funnel", () => {
    const { actions, onInsertBelow } = setup({
      funnelSteps: [SIGNED_UP, PURCHASED],
      label: "2. Purchased",
    });

    expect(actions).toHaveLength(1);
    const [action] = actions;
    expect(action).toMatchObject({
      title: "Where people went after Purchased",
    });
    if (!("onClick" in action) || action.onClick === undefined) {
      throw new Error("Expected an action that runs on click");
    }
    action.onClick({
      dispatch: jest.fn<unknown, [unknown]>(),
      closePopover: jest.fn<void, []>(),
    });

    expect(onInsertBelow).toHaveBeenCalledTimes(1);
    expect(onInsertBelow).toHaveBeenCalledWith({
      version: 1,
      kind: "paths",
      settings: { "paths.direction": "from", "paths.start": PURCHASED },
    });
  });

  it("offers nothing without funnel steps", () => {
    expect(setup({ label: "1. Signed up" }).actions).toEqual([]);
  });

  it("offers nothing for a click that isn't on a step", () => {
    expect(
      setup({ funnelSteps: [SIGNED_UP, PURCHASED], label: 42 }).actions,
    ).toEqual([]);
  });
});
