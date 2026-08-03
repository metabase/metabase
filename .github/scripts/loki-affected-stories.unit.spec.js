import { affectedStoriesFilter } from "./loki-affected-stories.mjs";

const entries = {
  "buttons-button--default": {
    type: "story",
    title: "Components/Buttons/Button",
    name: "Default",
    importPath: "./frontend/src/metabase/ui/Button.stories.tsx",
  },
  "buttons-button--compact": {
    type: "story",
    title: "Components/Buttons/Button",
    name: "Compact (small)",
    importPath: "./frontend/src/metabase/ui/Button.stories.tsx",
  },
  "buttons-button--docs": {
    type: "docs",
    title: "Components/Buttons/Button",
    name: "Docs",
    importPath: "./frontend/src/metabase/ui/Button.stories.tsx",
  },
  "viz-gauge--default": {
    type: "story",
    title: "viz/Gauge",
    name: "Default",
    importPath: "./frontend/src/metabase/visualizations/Gauge.stories.tsx",
  },
  "internal-thing--default": {
    type: "story",
    title: "Internal/Thing",
    name: "Default",
    importPath: "./frontend/src/metabase/internal/Thing.stories.tsx",
  },
};

describe("affectedStoriesFilter", () => {
  it("keeps only stories from affected files that pass the whitelist", () => {
    const { count, regex } = affectedStoriesFilter({
      entries,
      storyFiles: [
        "frontend/src/metabase/ui/Button.stories.tsx",
        "frontend/src/metabase/internal/Thing.stories.tsx",
      ],
      whitelist: "^Components/|^viz/",
    });
    expect(count).toBe(2);
    expect(regex).toBe(
      "^(Components/Buttons/Button Compact \\(small\\)|Components/Buttons/Button Default)$",
    );
  });

  it("produces a regex that matches like loki does", () => {
    const { regex } = affectedStoriesFilter({
      entries,
      storyFiles: ["frontend/src/metabase/ui/Button.stories.tsx"],
      whitelist: "^Components/",
    });
    const filter = new RegExp(regex, "i");
    expect(filter.test("Components/Buttons/Button Compact (small)")).toBe(true);
    expect(filter.test("Components/Buttons/Button Default")).toBe(true);
    expect(filter.test("Components/Buttons/ButtonGroup Default")).toBe(false);
    expect(filter.test("viz/Gauge Default")).toBe(false);
  });

  it("skips docs entries", () => {
    const { count } = affectedStoriesFilter({
      entries,
      storyFiles: ["frontend/src/metabase/ui/Button.stories.tsx"],
      whitelist: "",
    });
    expect(count).toBe(2);
  });

  it("returns count 0 and an empty regex when nothing survives", () => {
    expect(
      affectedStoriesFilter({
        entries,
        storyFiles: ["frontend/src/metabase/internal/Thing.stories.tsx"],
        whitelist: "^Components/",
      }),
    ).toEqual({ count: 0, regex: "" });
    expect(
      affectedStoriesFilter({ entries, storyFiles: [], whitelist: "" }),
    ).toEqual({ count: 0, regex: "" });
  });
});
