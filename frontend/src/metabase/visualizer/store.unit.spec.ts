import { visualizer } from "./store";
import { openVizSettings } from "./store";

describe("visualizer state", () => {
  describe("ui state", () => {
    it("should open viz settings and close the data menu", () => {
      const state = visualizer(
        {
          ui: {
            data: true,
            vizSettings: false,
          },
        },
        openVizSettings,
      );
      expect(state.ui.data).toBe(false);
      expect(state.ui.vizSettings).toBe(true);
    });
    xit("should close the viz settings menu without changing the data menu state", () => {});
  });
});
