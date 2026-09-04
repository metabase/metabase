import path from "path";

import glob from "glob";

import { elements } from "../module-boundaries.mjs";

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("module-boundaries elements", () => {
  it("every element pattern matches at least one file", () => {
    const stale = elements
      .filter(
        (element) =>
          glob.sync(element.pattern, {
            cwd: REPO_ROOT,
            dot: true,
            nodir: true,
          }).length === 0,
      )
      .map((element) => `${element.type} -> ${element.pattern}`);

    expect(stale).toEqual([]);
  });
});
