import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import micromatch, { isMatch } from "micromatch";
import { normalizeStories } from "storybook/internal/common";

import {
  MAIN_APP_STORY_GLOBS,
  getStories,
} from "../../.storybook/story-files.cjs";

const ROOT = resolve(__dirname, "../..");

describe("getStories", () => {
  let tempDir: string;
  let pathsFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "story-files-"));
    pathsFile = join(tempDir, "stories.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
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
    writeFileSync(
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

  it("rejects an empty plan even when the CSV filter is set", () => {
    writeFileSync(pathsFile, "[]");

    expect(() =>
      getStories({ pathsFile, filter: "frontend/src/Unselected.stories.tsx" }),
    ).toThrow("No stories selected");
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
      writeFileSync(pathsFile, contents);

      expect(() => getStories({ pathsFile })).toThrow();
    },
  );
});

describe("MAIN_APP_STORY_GLOBS", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", "--", "frontend", "enterprise/frontend"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
  const planned = micromatch(tracked, MAIN_APP_STORY_GLOBS, {
    dot: true,
  }).sort();

  it("matches the same tracked files as Storybook's own story matcher", () => {
    const specifiers = normalizeStories(getStories(), {
      configDir: join(ROOT, ".storybook"),
      workingDir: ROOT,
    });
    const built = tracked
      .filter(
        (file) =>
          !file.endsWith(".mdx") &&
          specifiers.some((specifier) =>
            specifier.importPathMatcher.test(`./${file}`),
          ),
      )
      .sort();

    expect(planned.length).toBeGreaterThan(0);
    expect(planned).toEqual(built);
  });

  // Storybook autotitles a story from its path relative to the entry's directory,
  // so an untitled story gets a different title in a narrowed build and Loki writes a fresh reference for it.
  it("matches only stories with an explicit title", () => {
    const untitled = planned.filter(
      (file) => !/^\s*title:/m.test(readFileSync(join(ROOT, file), "utf8")),
    );

    expect(untitled).toEqual([]);
  });
});
