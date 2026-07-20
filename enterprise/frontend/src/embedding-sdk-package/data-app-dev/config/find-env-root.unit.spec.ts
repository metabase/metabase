import fs from "node:fs";
import path from "node:path";

import { findEnvRoot } from "./find-env-root";

jest.mock("node:fs");

const mockedFs = jest.mocked(fs);

type SetupOpts = {
  existing?: string[];
  start: string;
};

const setup = ({ existing = [], start }: SetupOpts) => {
  const set = new Set(existing);

  mockedFs.existsSync.mockImplementation((p) => set.has(p.toString()));

  return { root: findEnvRoot(start) };
};

describe("findEnvRoot", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns the start dir when it holds .env.local", () => {
    const start = "/repo/data_apps/sales";
    expect(
      setup({ existing: [path.join(start, ".env.local")], start }).root,
    ).toBe(start);
  });

  it("walks up to the dir holding .env.local", () => {
    const { root } = setup({
      existing: [path.join("/repo", ".env.local")],
      start: "/repo/data_apps/sales",
    });
    expect(root).toBe("/repo");
  });

  it("stops at the git root even without an .env.local", () => {
    const { root } = setup({
      existing: [path.join("/repo", ".git")],
      start: "/repo/data_apps/sales",
    });
    expect(root).toBe("/repo");
  });

  it("returns the start dir when nothing is found within the search depth", () => {
    expect(setup({ start: "/a/b/c" }).root).toBe("/a/b/c");
  });

  it("does not search above the max depth (2 parents)", () => {
    // .env.local sits 3 levels up — beyond MAX_ENV_SEARCH_DEPTH.
    const { root } = setup({
      existing: [path.join("/root", ".env.local")],
      start: "/root/one/two/three",
    });
    expect(root).toBe("/root/one/two/three");
  });
});
