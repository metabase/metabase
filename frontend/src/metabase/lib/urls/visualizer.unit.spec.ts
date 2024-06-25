import { createMockCard } from "metabase-types/api/mocks";

import { visualizer } from "./visualizer";

describe("visualizer urls", () => {
  it("returns the base url if no setupDefinition is provided", () => {
    expect(visualizer()).toBe("v");
  });

  it("returns a visualizer url with setupDefinition if provided", () => {
    const setupDefinition = JSON.stringify({
      queries: {
        1: createMockCard({ id: 1 }),
        2: createMockCard({ id: 2 }),
      },
      visualization: {
        1: {
          type: "line",
        },
        2: undefined,
      },
    });
    expect(visualizer(setupDefinition)).toBe(`v/${setupDefinition}`);
  });
});
