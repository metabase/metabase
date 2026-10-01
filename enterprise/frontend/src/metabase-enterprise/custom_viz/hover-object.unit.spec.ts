import { createMockColumn } from "metabase-types/api/mocks";

import { type PluginHoverObject, toHostHoverObject } from "./hover-object";

describe("toHostHoverObject", () => {
  const column = createMockColumn({ name: "count" });
  const settings = { click_behavior: { type: "crossfilter" } };

  it("keeps the documented hover fields with the host settings", () => {
    const element = document.createElement("div");
    const event = new MouseEvent("mousemove");
    const hovered: PluginHoverObject = {
      index: 0,
      seriesIndex: 1,
      value: 42,
      column,
      data: [{ key: "count", col: column, value: 42 }],
      dimensions: [{ value: "a", column }],
      element,
      event,
    };

    expect(toHostHoverObject(hovered, settings)).toEqual({
      ...hovered,
      settings,
    });
  });

  it("replaces plugin-supplied settings and drops host-only fields", () => {
    const hovered = {
      value: 42,
      settings: {
        click_behavior: { type: "link", linkType: "question", targetId: 1 },
      },
      seriesId: 3,
      datumIndex: 2,
      isAlreadyScaled: true,
      pieSliceKeyPath: ["a"],
    };

    expect(toHostHoverObject(hovered, settings)).toEqual({
      value: 42,
      settings,
    });
  });
});
