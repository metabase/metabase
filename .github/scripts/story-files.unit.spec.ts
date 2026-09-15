import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import micromatch, { isMatch } from "micromatch";
import { normalizeStories } from "storybook/internal/common";

import {
  MAIN_APP_STORY_GLOBS,
  getStories,
  hasExplicitTitle,
} from "../../.storybook/story-files.cjs";

const ROOT = resolve(__dirname, "../..");

const tracked = execFileSync(
  "git",
  ["ls-files", "-z", "--", "frontend", "enterprise/frontend"],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .split("\0")
  .filter(Boolean);
const planned = micromatch(tracked, MAIN_APP_STORY_GLOBS, { dot: true }).sort();

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
    const files = planned.slice(0, 2);
    writeFileSync(pathsFile, JSON.stringify(files));

    expect(getStories({ pathsFile })).toEqual(
      files.map((file) => `../${file}`),
    );
  });

  it("builds a planned story with an explicit title", () => {
    const story = join(tempDir, "Titled.stories.tsx");
    writeFileSync(
      story,
      'const meta = { title: "Components/Titled" };\nexport default meta;\n',
    );
    writeFileSync(pathsFile, JSON.stringify([story]));

    expect(getStories({ pathsFile })).toEqual([`../${story}`]);
  });

  it("rejects a planned story without an explicit title", () => {
    const story = join(tempDir, "Untitled.stories.tsx");
    writeFileSync(story, "export default { component: Untitled };\n");
    writeFileSync(pathsFile, JSON.stringify([story]));

    expect(() => getStories({ pathsFile })).toThrow(story);
  });

  it("rejects an untitled Alert story even though its args have a title", () => {
    const source = readFileSync(
      join(
        ROOT,
        "frontend/src/metabase/ui/components/feedback/Alert/Alert.stories.tsx",
      ),
      "utf8",
    ).replace('  title: "Components/Feedback/Alert",\n', "");
    const story = join(tempDir, "Alert.stories.tsx");
    writeFileSync(story, source);
    writeFileSync(pathsFile, JSON.stringify([story]));

    expect(() => getStories({ pathsFile })).toThrow(story);
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

describe("hasExplicitTitle", () => {
  it.each([
    {
      form: "double quotes",
      source: 'export default {\n  title: "Components/Button",\n};\n',
    },
    {
      form: "single quotes",
      source: "export default {\n  title: 'Components/Button',\n};\n",
    },
    {
      form: "a title constant",
      source: 'const title = "Components/Button"; export default { title };',
    },
    {
      form: "a meta constant",
      source:
        'const meta: Meta<typeof Button> = {\n  title: "Components/Button",\n};\n\nexport default meta;\n',
    },
    {
      form: "a satisfies expression",
      source:
        'const meta = { title: "Components/Button" } satisfies Meta<typeof Button>; export default meta;',
    },
  ])("accepts a title in $form", ({ source }) => {
    expect(hasExplicitTitle(source)).toBe(true);
  });

  it.each([
    {
      form: "no title",
      source: "export default {\n  component: Button,\n};\n",
    },
    {
      form: "only a title control",
      source:
        'const argTypes = {\n  title: {\n    control: { type: "text" },\n  },\n};\n\nexport default { component: Button, argTypes };\n',
    },
    {
      form: "only a title variable",
      source:
        "export default {\n  component: Button,\n  args: {\n    title: defaultTitle,\n  },\n};\n",
    },
    {
      form: "only a string-valued args title",
      source: 'export default { args: { title: "Button label" } };',
    },
    {
      form: "only another object's title",
      source:
        'const other = { title: "Other" }; export default { component: Button };',
    },
    {
      form: "only a commented title",
      source:
        'export default {\n // title: "Components/Button",\n component: Button };',
    },
    {
      form: "an empty title",
      source: 'export default { title: "" };',
    },
    {
      form: "a template literal unsupported by Storybook",
      source: "export default { title: `Components/Button` };",
    },
  ])("rejects $form", ({ source }) => {
    expect(hasExplicitTitle(source)).toBe(false);
  });
});

describe("MAIN_APP_STORY_GLOBS", () => {
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

  it("matches no docs entries", () => {
    expect(planned.filter((file) => file.endsWith(".mdx"))).toEqual([]);
  });

  it("matches only stories with an explicit title", () => {
    const untitled = planned.filter(
      (file) => !hasExplicitTitle(readFileSync(join(ROOT, file), "utf8")),
    );

    expect(untitled).toEqual([]);
  });
});
