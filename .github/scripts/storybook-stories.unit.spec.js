const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { isMatch } = require("micromatch");

const {
  MAIN_APP_STORY_GLOBS,
  getStories,
} = require("../../.storybook/story-files.cjs");

describe("Storybook story selection", () => {
  let tempDir;
  let pathsFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "storybook-stories-"));
    pathsFile = path.join(tempDir, "stories.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads the main app stories and docs when there is no plan", () => {
    const patterns = getStories({ pathsFile: "", filter: "" });

    expect(
      isMatch("../frontend/src/metabase/ui/Button.stories.tsx", patterns),
    ).toBe(true);
    expect(isMatch("../frontend/src/metabase/ui/Button.mdx", patterns)).toBe(
      true,
    );
    expect(
      isMatch(
        "../frontend/src/embedding-sdk-shared/Button.stories.tsx",
        patterns,
      ),
    ).toBe(false);
  });

  it("builds only the files in the JSON plan", () => {
    fs.writeFileSync(
      pathsFile,
      JSON.stringify([
        "frontend/src/metabase/ui/Button.stories.tsx",
        "enterprise/frontend/src/metabase-enterprise/Upsell.stories.tsx",
      ]),
    );

    expect(getStories({ pathsFile })).toEqual([
      "../frontend/src/metabase/ui/Button.stories.tsx",
      "../enterprise/frontend/src/metabase-enterprise/Upsell.stories.tsx",
    ]);
  });

  it("keeps an empty plan empty even when the CSV filter is set", () => {
    fs.writeFileSync(pathsFile, "[]");

    expect(
      getStories({ pathsFile, filter: "frontend/src/Unselected.stories.tsx" }),
    ).toEqual([]);
  });

  it("preserves spaces and commas in planned paths", () => {
    fs.writeFileSync(
      pathsFile,
      JSON.stringify(["frontend/src/One, two stories.stories.tsx"]),
    );

    expect(getStories({ pathsFile })).toEqual([
      "../frontend/src/One, two stories.stories.tsx",
    ]);
  });

  it("preserves the stress test's CSV filter", () => {
    expect(
      getStories({
        filter: "frontend/One.stories.tsx,frontend/Two.stories.tsx",
      }),
    ).toEqual(["../frontend/One.stories.tsx", "../frontend/Two.stories.tsx"]);
  });

  it.each(["{", "null", '""', "{}", "[null]"])(
    "rejects an invalid plan: %s",
    (contents) => {
      fs.writeFileSync(pathsFile, contents);

      expect(() => getStories({ pathsFile })).toThrow();
    },
  );

  it.each([
    ["frontend/src/metabase/ui/Button.stories.tsx", true],
    ["frontend/src/metabase/ui/Button.stories.ts", true],
    ["enterprise/frontend/src/metabase-enterprise/Upsell.stories.tsx", true],
    ["frontend/src/embedding-sdk-bundle/Button.stories.tsx", false],
    ["frontend/src/embedding-sdk-shared/Button.stories.tsx", false],
    ["enterprise/frontend/src/embedding-sdk-ee/Button.stories.tsx", false],
    ["enterprise/frontend/src/embedding-sdk-package/Button.stories.tsx", false],
    ["frontend/src/metabase/ui/Button.stories.js", false],
    ["frontend/src/metabase/ui/Button.mdx", false],
  ])("includes %s in the planner's story inventory: %s", (file, expected) => {
    expect(isMatch(file, MAIN_APP_STORY_GLOBS)).toBe(expected);
  });
});
