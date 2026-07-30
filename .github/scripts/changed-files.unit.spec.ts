import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type Deps,
  type EventContext,
  listPullRequestFiles,
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
  ...overrides,
});

// Canned stdout keyed by "<command> <subcommand>", e.g. "git diff", "gh api".
// Records every invocation so call shape can be asserted.
function fakeRun(
  responses: Record<string, string | Error> = {},
): Deps["run"] & { calls: string[][] } {
  const calls: string[][] = [];
  const run = (command: string, args: string[]) => {
    calls.push([command, ...args]);
    const response = responses[`${command} ${args[0]}`];
    if (response instanceof Error) {
      throw response;
    }
    return response ?? "";
  };
  return Object.assign(run, { calls });
}

const deps = (overrides: Partial<Deps> = {}): Deps => ({
  run: fakeRun(),
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

describe("listPullRequestFiles", () => {
  const ghLine = (filename: string, status: string) =>
    JSON.stringify({ filename, status });

  it("asks gh for the PR's files, one JSON object per line", () => {
    const run = fakeRun({
      "gh api": `${ghLine("src/a.clj", "modified")}\n${ghLine("b.md", "added")}\n`,
    });

    expect(listPullRequestFiles(context({ pullRequestNumber: 7 }), deps({ run }))).toEqual([
      { filename: "src/a.clj", status: "modified" },
      { filename: "b.md", status: "added" },
    ]);
    expect(run.calls[0]).toEqual([
      "gh",
      "api",
      "--paginate",
      "repos/metabase/metabase/pulls/7/files",
      "--jq",
      ".[] | {filename, status} | @json",
    ]);
  });

  it("translates the API's status vocabulary to git's", () => {
    const run = fakeRun({
      "gh api": [
        ghLine("gone.clj", "removed"),
        ghLine("moved.clj", "renamed"),
        ghLine("perms.clj", "changed"),
        ghLine("same.clj", "unchanged"),
      ].join("\n"),
    });

    expect(
      listPullRequestFiles(context({ pullRequestNumber: 7 }), deps({ run })).map(
        (file) => file.status,
      ),
    ).toEqual(["deleted", "renamed", "modified", "unknown"]);
  });

  it("reads a PR that changed nothing", () => {
    const run = fakeRun({ "gh api": "\n" });

    expect(
      listPullRequestFiles(context({ pullRequestNumber: 7 }), deps({ run })),
    ).toEqual([]);
  });

  it("refuses to guess when the event carries no PR number", () => {
    expect(() =>
      listPullRequestFiles(context({ pullRequestNumber: null }), deps()),
    ).toThrow();
  });
});

describe("resolveChangeSet", () => {
  describe("pull_request", () => {
    it("takes the file list from gh", () => {
      const run = fakeRun({
        "gh api": JSON.stringify({
          filename: "src/a.clj",
          status: "modified",
        }),
      });
      const result = resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({ run }),
      );

      expect(result).toEqual({
        kind: "files",
        files: [{ filename: "src/a.clj", status: "modified" }],
      });
    });

    it("does not touch git", () => {
      const run = fakeRun();
      resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({ run }),
      );

      expect(run.calls.filter(([command]) => command === "git")).toEqual([]);
    });

    it("fails open when gh fails", () => {
      const run = fakeRun({ "gh api": new Error("gh: HTTP 403") });
      const result = resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({ run }),
      );

      expect(result).toMatchObject({ kind: "all" });
    });

    it("fails open when gh returns something unparseable", () => {
      const run = fakeRun({ "gh api": "not json" });
      const result = resolveChangeSet(
        context({ eventName: "pull_request", pullRequestNumber: 1 }),
        deps({ run }),
      );

      expect(result).toMatchObject({ kind: "all" });
    });
  });

  describe("push to the default branch", () => {
    it("diffs against the commit before the push", () => {
      const run = fakeRun({ "git diff": "M\0src/a.clj\0" });
      const result = resolveChangeSet(context(), deps({ run }));

      expect(result).toEqual({
        kind: "files",
        files: [{ filename: "src/a.clj", status: "modified" }],
      });
      expect(run.calls).toContainEqual([
        "git",
        "diff",
        "--name-status",
        "-z",
        "beforesha",
        "headsha",
      ]);
    });

    it("fails open on a new branch, where there is no previous commit", () => {
      const result = resolveChangeSet(context({ before: EMPTY_SHA }), deps());

      expect(result).toMatchObject({ kind: "all" });
    });

    it("fails open when the payload carries no previous commit", () => {
      const result = resolveChangeSet(context({ before: null }), deps());

      expect(result).toMatchObject({ kind: "all" });
    });

    it("fails open when the commit stays unreachable after deepening", () => {
      const run = fakeRun({
        "git cat-file": new Error("missing"),
        "git fetch": new Error("cannot deepen"),
      });
      const result = resolveChangeSet(context(), deps({ run }));

      expect(result).toMatchObject({ kind: "all" });
    });
  });

  describe("push to another branch", () => {
    it("takes a three-dot diff against the merge-base with the default branch", () => {
      const run = fakeRun({ "git diff": "A\0src/b.clj\0" });
      const result = resolveChangeSet(
        context({ refName: "release-x.63.x" }),
        deps({ run }),
      );

      expect(result).toEqual({
        kind: "files",
        files: [{ filename: "src/b.clj", status: "added" }],
      });
      expect(run.calls).toContainEqual([
        "git",
        "diff",
        "--name-status",
        "-z",
        "origin/master...headsha",
      ]);
    });

    it("fails open when no merge-base can be found", () => {
      const run = fakeRun({
        "git merge-base": new Error("unrelated histories"),
        "git fetch": new Error("no such ref"),
      });
      const result = resolveChangeSet(
        context({ refName: "release-x.63.x" }),
        deps({ run }),
      );

      expect(result).toMatchObject({ kind: "all" });
    });
  });

  it.each(["merge_group", "schedule", "workflow_dispatch", ""])(
    "fails open on the unhandled %s event",
    (eventName) => {
      const result = resolveChangeSet(context({ eventName }), deps());

      expect(result).toMatchObject({ kind: "all" });
    },
  );

  it("fails open when git itself blows up", () => {
    const run = fakeRun({ "git diff": new Error("not a repository") });
    const result = resolveChangeSet(context(), deps({ run }));

    expect(result).toMatchObject({ kind: "all" });
  });
});
