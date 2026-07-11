import { getSettingsWidgets } from "metabase/visualizations/lib/settings";

import { Map } from "./Map";

describe("Map viz settings (metabase#40999)", () => {
  it("should expose the 'Pin type' setting as an editable widget", () => {
    // Only the pin_type definition is exercised here so the witness stays
    // minimal and independent of the rest of the map settings.
    const defs = { "map.pin_type": Map.settings["map.pin_type"] };
    const computedSettings = { "map.type": "pin" };

    const widgets = getSettingsWidgets(
      defs,
      {},
      computedSettings,
      [{ data: { rows: [], cols: [] } }],
      () => {},
    );

    // getSettingsWidgets drops any setting whose `widget` is falsy, so the
    // "Pin type" entry is only present when the definition sets `widget`.
    expect(widgets.map((w) => w.id)).toContain("map.pin_type");
  });
});
