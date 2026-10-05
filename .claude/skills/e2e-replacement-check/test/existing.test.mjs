import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { extendLines, sourcesOfSpec } from "../lib/existing.mjs";
import { repoRoot } from "../lib/git.mjs";
import { parseArgs } from "../lib/options.mjs";
import { loadTypescript } from "../lib/scope.mjs";
import { findDuplicates, scanSpecs } from "../lib/unit-scan.mjs";

const ts = loadTypescript(repoRoot(process.cwd()));
let root;

const RENDER_AND_CHECK = `
  render(<Widget name="a" />);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByText("Saved")).toBeInTheDocument();`;

const files = {
  "src/Widget.tsx": "export const Widget = () => null;\n",
  "src/Other.tsx": "export const Widget = () => null;\n",
  "src/tests/setup.tsx": 'import { Widget } from "../Widget";\nexport const setup = () => Widget;\n',
  "src/tests/Widget.unit.spec.tsx": 'import { setup } from "./setup";\nimport { Helper } from "../Helper.module.css";\nit("works", () => setup());\n',
  "src/types.ts": "export type Props = { name: string };\n",
  "src/Widget.unit.spec.tsx": `import { Widget } from "./Widget";
import type { Props } from "./types";
it("saves", async () => {${RENDER_AND_CHECK}
});
it("saves and closes", async () => {${RENDER_AND_CHECK}
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("is short", () => {
  expect(Widget).toBeDefined();
});
`,
  "src/Copy.unit.spec.tsx": `import { Widget } from "./Widget";
it("saves the widget", async () => {${RENDER_AND_CHECK}
});
it("is short too", () => {
  expect(Widget).toBeDefined();
});
`,
  "src/Fork.unit.spec.tsx": `import { Widget } from "./Other";
it("saves the forked widget", async () => {${RENDER_AND_CHECK}
});
`,
};

before(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rc-existing-")));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

const scan = () => scanSpecs({ ts, root, files: ["src/Widget.unit.spec.tsx", "src/Copy.unit.spec.tsx", "src/Fork.unit.spec.tsx"] });
const pairs = (dups) => dups.map(({ kind, a, b }) => `${kind}: ${a.title} / ${b.title}`).sort();

describe("existing", () => {
  it("should find the product file a spec tests, through a setup helper", () => {
    assert.deepEqual(sourcesOfSpec(ts, root, "src/Widget.unit.spec.tsx"), ["src/Widget.tsx"]);
    assert.deepEqual(sourcesOfSpec(ts, root, "src/tests/Widget.unit.spec.tsx"), ["src/Widget.tsx"]);
  });

  it("should flag an exact copy in another spec, and a test that is the opening steps of a longer one", () => {
    const dups = findDuplicates(scan(), (r) => r.file === "src/Copy.unit.spec.tsx" || r.title === "saves");
    assert.deepEqual(pairs(dups), ["exact copy: saves / saves the widget", "prefix: saves / saves and closes", "prefix: saves the widget / saves and closes"]);
  });

  it("should not flag the same body when its names point at a different component", () => {
    const dups = findDuplicates(scan(), (r) => r.file === "src/Fork.unit.spec.tsx");
    assert.deepEqual(dups, []);
  });

  it("should not flag one-line checks that repeat", () => {
    const dups = findDuplicates(scan(), (r) => r.title.startsWith("is short"));
    assert.deepEqual(dups, []);
  });

  it("should tell a new spec to extend the existing spec of the same component", () => {
    const perSpec = [
      { spec: "src/Widget.new.unit.spec.tsx", status: "new", groups: [{ source: "src/Widget.tsx", direct: ["src/Widget.unit.spec.tsx"] }] },
      { spec: "src/Other.unit.spec.tsx", status: "new", groups: [{ source: "src/Other.tsx", direct: [] }] },
      { spec: "src/Copy.unit.spec.tsx", status: "changed", groups: [{ source: "src/Widget.tsx", direct: ["src/Widget.unit.spec.tsx"] }] },
    ];
    assert.deepEqual(extendLines(perSpec), [
      "  src/Widget.new.unit.spec.tsx is new, but src/Widget.unit.spec.tsx already tests src/Widget.tsx. Add the tests there instead.",
    ]);
  });

  it("should take source or spec paths only for the existing command", () => {
    assert.deepEqual(parseArgs(["existing", "src/Widget.tsx", "src/Other.tsx"]).paths, ["src/Widget.tsx", "src/Other.tsx"]);
    assert.deepEqual(parseArgs(["existing"]).paths, []);
    assert.throws(() => parseArgs(["run", "src/Widget.tsx"]), /unexpected argument/);
  });
});
