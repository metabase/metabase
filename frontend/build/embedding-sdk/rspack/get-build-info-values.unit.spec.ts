import { spawnSync } from "child_process";

import { getBuildInfoValues } from "./get-build-info-values";

jest.mock("child_process", () => ({
  spawnSync: jest.fn(),
}));

const mockSpawnSync = jest.mocked(spawnSync);

describe("getBuildInfoValues", () => {
  afterEach(() => {
    mockSpawnSync.mockReset();
  });

  it("should read branch and commit from git", () => {
    mockSpawnSync.mockImplementation((_command, args) => ({
      pid: 1,
      output: [],
      stdout: args?.includes("--abbrev-ref")
        ? "master\n"
        : "0123456789abcdef\n",
      stderr: "",
      status: 0,
      signal: null,
    }));

    expect(getBuildInfoValues({ version: "1.0.0" })).toMatchObject({
      VERSION: "1.0.0",
      GIT_BRANCH: "master",
      GIT_COMMIT_SHA: "0123456",
    });
  });

  it("should fall back to placeholders outside git repository (metabase#83153)", () => {
    mockSpawnSync.mockReturnValue({
      pid: 1,
      output: [],
      stdout: "",
      stderr: "fatal: not a git repository",
      status: 128,
      signal: null,
    });

    expect(getBuildInfoValues({ version: "1.0.0" })).toMatchObject({
      GIT_BRANCH: "?",
      GIT_COMMIT_SHA: "?",
    });
  });
});
