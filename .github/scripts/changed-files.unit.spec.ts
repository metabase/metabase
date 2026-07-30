import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type Deps,
  type EventContext,
  parseNameStatus,
  readEventContext,
  resolveChangeSet,
} from "./changed-files";

const EMPTY_SHA = "0".repeat(40);

const context = (overrides: Partial<EventContext> = {}): EventContext => ({
  eventName: "push",
  refName: "master",
  sha: "headsha",
  before: "beforesha",
  defaultBranch: "master",
  pullRequestNumber: null,
  repository: "metabase/metabase",
  token: "token",
  ...overrides,
});

// Returns canned stdout per git subcommand and records the calls made.
function fakeGit(
  responses: Record<string, string | Error> = {},
): Deps["git"] & { calls: string[][] } {
  const calls: string[][] = [];
  const git = (args: string[]) => {
    calls.push(args);
    const response = responses[args[0]];
    if (response instanceof Error) {
      throw response;
    }
    return response ?? "";
  };
  return Object.assign(git, { calls });
}

const deps = (overrides: Partial<Deps> = {}): Deps => ({
  git: fakeGit(),
  listPullRequestFiles: async () => [],
  log: () => {},
  ...overrides,
});

describe("parseNameStatus", () => {
  it("reads plain statuses", () => {
    expect(parseNameStatus("M\0src/a.clj\0A\0src/b.clj\0D\0src/c.clj\0")).toEqual(
      [
        { filename: "src/a.clj", status: "modified" },
        { filename: "src/b.clj", status: "added" },
        { filename: "src/c.clj", status: "deleted" },
      ],
    );
  });

  it("takes the new path for renames and copies", () => {
    expect(parseNameStatus("R100\0old.clj\0new.clj\0C75\0src.clj\0copy.clj\0")).toEqual(
      [
        { filename: "new.clj", status: "renamed" },
        { filename: "copy.clj", status: "copied" },
      ],
    );
  });

  it("reads an unmerged path", () => {
    expect(parseNameStatus("U\0conflict.clj\0")).toEqual([
      { filename: "conflict.clj", status: "unmerged" },
    ]);
  });

  // dorny leaves T unmapped; treating it as a modification matches more, not
  // less, which is the safe direction.
  it("treats a type change as a modification", () => {
    expect(parseNameStatus("T\0link\0")).toEqual([
      { filename: "link", status: "modified" },
    ]);
  });

  it("falls back to unknown for letters it does not model", () => {
    expect(parseNameStatus("X\0odd.clj\0")).toEqual([
      { filename: "odd.clj", status: "unknown" },
    ]);
  });

  it("keeps paths containing spaces intact", () => {
    expect(parseNameStatus("M\0a file.md\0")).toEqual([
      { filename: "a file.md", status: "modified" },
    ]);
  });

  it("reads an empty diff", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("readEventContext", () => {
  it("falls back to defaults when there is no event payload", () => {
    expect(readEventContext({})).toMatchObject({
      eventName: "",
      sha: "HEAD",
      before: null,
      defaultBranch: "master",
      pullRequestNumber: null,
    });
  });

  it("reads the payload when one is present", () => {
    const path = join(mkdtempSync(join(tmpdir(), "event-")), "event.json");
    writeFileSync(
      path,
      JSON.stringify({
        before: "abc",
        repository: { default_branch: "main" },
        pull_request: { number: 42 },
      }),
    );

    expect(
      readEventContext({
        GITHUB_EVENT_PATH: path,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: "metabase/metabase",
      }),
    ).toMatchObject({
      eventName: "pull_request",
      before: "abc",
      defaultBranch: "main",
      pullRequestNumber: 42,
    });
  });

  it("ignores an unreadable payload rather than throwing", () => {
    expect(() =>
      readEventContext({ GITHUB_EVENT_PATH: "/nope/does-not-exist.json" }),
    ).not.toThrow();
  });
});

describe("resolveChangeSet", () => {
  describe("pull_request", () => {
    it("takes the file list from the API", async () => {
      const files = [{ filename: "src/a.clj", status: "modified" as const }];
      const result = await resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({ listPullRequestFiles: async () => files }),
      );

      expect(result).toEqual({ kind: "files", files });
    });

    it("does not touch git", async () => {
      const git = fakeGit();
      await resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({ git }),
      );

      expect(git.calls).toEqual([]);
    });

    it("fails open when the API call fails", async () => {
      const result = await resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({
          listPullRequestFiles: async () => {
            throw new Error("403");
          },
        }),
      );

      expect(result).toMatchObject({ kind: "all" });
    });
  });

  describe("push to the default branch", () => {
    it("diffs against the commit before the push", async () => {
      const git = fakeGit({ diff: "M\0src/a.clj\0" });
      const result = await resolveChangeSet(context(), deps({ git }));

      expect(result).toEqual({
        kind: "files",
        files: [{ filename: "src/a.clj", status: "modified" }],
      });
      expect(git.calls).toContainEqual([
        "diff",
        "--name-status",
        "-z",
        "beforesha",
        "headsha",
      ]);
    });

    it("fails open on a new branch, where there is no previous commit", async () => {
      const result = await resolveChangeSet(
        context({ before: EMPTY_SHA }),
        deps(),
      );

      expect(result).toMatchObject({ kind: "all" });
    });

    it("fails open when the payload carries no previous commit", async () => {
      const result = await resolveChangeSet(context({ before: null }), deps());

      expect(result).toMatchObject({ kind: "all" });
    });

    it("fails open when the commit stays unreachable after deepening", async () => {
      const git = fakeGit({
        "cat-file": new Error("missing"),
        fetch: new Error("cannot deepen"),
      });
      const result = await resolveChangeSet(context(), deps({ git }));

      expect(result).toMatchObject({ kind: "all" });
    });
  });

  describe("push to another branch", () => {
    it("takes a three-dot diff against the merge-base with the default branch", async () => {
      const git = fakeGit({ diff: "A\0src/b.clj\0" });
      const result = await resolveChangeSet(
        context({ refName: "release-x.63.x" }),
        deps({ git }),
      );

      expect(result).toEqual({
        kind: "files",
        files: [{ filename: "src/b.clj", status: "added" }],
      });
      expect(git.calls).toContainEqual([
        "diff",
        "--name-status",
        "-z",
        "origin/master...headsha",
      ]);
    });

    it("fails open when no merge-base can be found", async () => {
      const git = fakeGit({
        "merge-base": new Error("unrelated histories"),
        fetch: new Error("no such ref"),
      });
      const result = await resolveChangeSet(
        context({ refName: "release-x.63.x" }),
        deps({ git }),
      );

      expect(result).toMatchObject({ kind: "all" });
    });
  });

  it.each(["merge_group", "schedule", "workflow_dispatch", ""])(
    "fails open on the unhandled %s event",
    async (eventName) => {
      const result = await resolveChangeSet(context({ eventName }), deps());

      expect(result).toMatchObject({ kind: "all" });
    },
  );

  it("fails open when git itself blows up", async () => {
    const git = fakeGit({ diff: new Error("not a repository") });
    const result = await resolveChangeSet(context(), deps({ git }));

    expect(result).toMatchObject({ kind: "all" });
  });
});
