import type { ClickObject } from "metabase/visualizations/types";
import { createMockColumn } from "metabase-types/api/mocks";

import { type PluginClickObject, toHostClickObject } from "./click-object";

describe("toHostClickObject", () => {
  const column = createMockColumn({ name: "count" });
  const settings = { click_behavior: { type: "crossfilter" } };

  it("keeps the documented click fields", () => {
    const element = document.createElement("div");
    const event = new MouseEvent("click");
    const clicked: PluginClickObject = {
      value: 42,
      column,
      dimensions: [{ value: "a", column }],
      event,
      element,
      origin: { row: [42], cols: [column] },
      data: [{ col: column, value: 42 }],
    };

    expect(toHostClickObject(clicked, settings)).toEqual({
      ...clicked,
      settings,
    });
  });

  it("replaces plugin-supplied settings and drops host-only fields", () => {
    const clicked: ClickObject = {
      value: 42,
      settings: {
        click_behavior: { type: "link", linkType: "question", targetId: 1 },
      },
      cardId: 1,
      seriesIndex: 3,
      columnShortcuts: true,
      extraData: { setParameterValue: jest.fn() },
    };

    expect(toHostClickObject(clicked, settings)).toEqual({
      value: 42,
      settings,
    });
  });
});
