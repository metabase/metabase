import {
  type PullRequest,
  RUN_TESTS_PATH,
  type WorkflowRun,
  autoPassComment,
  decideAutoPass,
  failedJobNames,
  fetchFlakeProbability,
  formatPercent,
  readContext,
  runMismatch,
  unfinishedJobNames,
} from "./flaky-rerun-auto-pass";

const SHA = "0123456789abcdef0123456789abcdef01234567";

const flaky = {
  status: "ok",
  sha: SHA,
  flake_probability: 0.93,
  verdict: "likely_flaky",
  flake_confirmed: true,
};

describe("decideAutoPass", () => {
  it("auto-passes a confirmed, likely-flaky answer about this commit", () => {
    expect(decideAutoPass(flaky, SHA)).toEqual({
      autoPass: true,
      flakeProbability: 0.93,
    });
  });

  it("matches the sha case-insensitively", () => {
    expect(decideAutoPass(flaky, SHA.toUpperCase()).autoPass).toBe(true);
  });

  it.each([
    ["an uncertain verdict", { verdict: "uncertain" }],
    ["a likely-legitimate verdict", { verdict: "likely_legitimate" }],
    ["an unconfirmed answer", { flake_confirmed: false }],
    ["a missing confirmation", { flake_confirmed: undefined }],
    ["an answer about another commit", { sha: "f".repeat(40) }],
    ["an answer about no commit", { sha: undefined }],
    ["an out-of-range probability", { flake_probability: -1 }],
    ["a missing probability", { flake_probability: undefined }],
  ])("does not auto-pass %s", (_, override) => {
    expect(decideAutoPass({ ...flaky, ...override }, SHA).autoPass).toBe(false);
  });

  it.each(["overflow", "no_failures", "disabled", "unavailable"])(
    "does not auto-pass a %s answer",
    (status) => {
      const decision = decideAutoPass(
        { status, sha: SHA, flake_confirmed: true },
        SHA,
      );
      expect(decision).toEqual({
        autoPass: false,
        reason: `verdict is "${status}", not "likely_flaky"`,
      });
    },
  );
});

describe("readContext", () => {
  const env = {
    RUN_ID: "123",
    PR_NUMBER: "82887",
    HEAD_SHA: SHA,
  };

  it("reads the dispatch inputs", () => {
    expect(readContext(env)).toEqual({
      runId: 123,
      prNumber: 82887,
      headSha: SHA,
    });
  });

  it.each([
    ["a missing run id", { RUN_ID: "" }],
    ["a run id that isn't a number", { RUN_ID: "abc" }],
    ["a missing PR number", { PR_NUMBER: "" }],
    ["a missing head sha", { HEAD_SHA: "" }],
    ["a short head sha", { HEAD_SHA: SHA.slice(0, 7) }],
  ])("skips %s", (_, override) => {
    expect(readContext({ ...env, ...override })).toHaveProperty("skip");
  });
});

describe("runMismatch", () => {
  const REPO = "metabase/metabase";
  const run: WorkflowRun = {
    path: RUN_TESTS_PATH,
    event: "pull_request",
    status: "completed",
    head_sha: SHA,
    head_branch: "my-branch",
    run_attempt: 1,
    head_repository: { full_name: REPO },
  };
  const pr: PullRequest = {
    state: "open",
    user: { login: "octocat" },
    head: { sha: SHA, ref: "my-branch", repo: { full_name: REPO } },
  };
  const check = (
    runOverride: Partial<WorkflowRun> = {},
    prOverride: Partial<PullRequest> = {},
  ) =>
    runMismatch({
      run: { ...run, ...runOverride },
      pr: { ...pr, ...prOverride },
      headSha: SHA,
      repository: REPO,
    });

  it("accepts a finished Run tests run of an open PR at the run's commit", () => {
    expect(check()).toBeNull();
  });

  it("matches the sha case-insensitively", () => {
    expect(check({ head_sha: SHA.toUpperCase() })).toBeNull();
  });

  it.each([
    ["another workflow", { path: ".github/workflows/e2e.yml" }],
    ["a push", { event: "push" }],
    ["a fork", { head_repository: { full_name: "someone/metabase" } }],
    ["another commit", { head_sha: "f".repeat(40) }],
    ["a run still in progress", { status: "in_progress" }],
  ])("rejects %s", (_, override) => {
    expect(check(override)).not.toBeNull();
  });

  it.each([
    ["a closed PR", { state: "closed" }],
    ["a PR that has moved on", { head: { ...pr.head, sha: "f".repeat(40) } }],
    ["a PR from another branch", { head: { ...pr.head, ref: "other" } }],
    [
      "a PR from a fork",
      { head: { ...pr.head, repo: { full_name: "someone/metabase" } } },
    ],
  ])("rejects %s", (_, override) => {
    expect(check({}, override)).not.toBeNull();
  });
});

describe("failedJobNames", () => {
  it("names each failed job once, and nothing else", () => {
    expect(
      failedJobNames([
        { name: "backend-tests / be-tests (1)", conclusion: "failure" },
        { name: "backend-tests / be-tests-result", conclusion: "failure" },
        { name: "backend-tests / be-tests-result", conclusion: "failure" },
        { name: "frontend-tests / fe-tests-result", conclusion: "success" },
        { name: "driver-tests / be-tests-oracle", conclusion: "skipped" },
        { name: "e2e-tests / e2e-tests-result", conclusion: null },
      ]),
    ).toEqual([
      "backend-tests / be-tests (1)",
      "backend-tests / be-tests-result",
    ]);
  });
});

describe("unfinishedJobNames", () => {
  it("names each job that neither passed nor failed", () => {
    expect(
      unfinishedJobNames([
        { name: "backend-tests / be-tests (1)", conclusion: "failure" },
        { name: "frontend-tests / fe-tests-result", conclusion: "success" },
        { name: "driver-tests / be-tests-oracle", conclusion: "skipped" },
        { name: "e2e-tests / e2e-tests (3)", conclusion: "cancelled" },
        { name: "e2e-tests / e2e-tests (3)", conclusion: "cancelled" },
        { name: "app-db-tests / app-db-tests (2)", conclusion: "timed_out" },
      ]),
    ).toEqual(["e2e-tests / e2e-tests (3)", "app-db-tests / app-db-tests (2)"]);
  });

  it("is empty when every job passed or failed", () => {
    expect(
      unfinishedJobNames([
        { name: "backend-tests / be-tests (1)", conclusion: "failure" },
        { name: "frontend-tests / fe-tests-result", conclusion: "success" },
      ]),
    ).toEqual([]);
  });
});

describe("fetchFlakeProbability", () => {
  afterEach(() => {
    // @ts-expect-error -- removing the stub the tests installed
    delete global.fetch;
  });

  const load = () =>
    fetchFlakeProbability({
      baseUrl: "https://conductor.example.com/",
      secret: "secret",
      prNumber: 82887,
      retryDelayMs: 1,
    });

  it("asks for the PR with the API key", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => flaky });
    global.fetch = fetchMock;

    expect(await load()).toEqual(flaky);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://conductor.example.com/api/flake-probability?pr=82887",
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      "x-api-key": "secret",
    });
  });

  it("retries a server error", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      })
      .mockResolvedValueOnce({ ok: true, json: async () => flaky });
    global.fetch = fetchMock;

    expect(await load()).toEqual(flaky);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on an auth error without retrying", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    global.fetch = fetchMock;

    expect(await load()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after repeated network errors", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    global.fetch = fetchMock;

    expect(await load()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("comment", () => {
  it("rounds the probability to a whole percent", () => {
    expect(formatPercent(0.926)).toBe("93%");
  });

  it("names the commit, the probability and the run", () => {
    const body = autoPassComment({
      headSha: SHA,
      flakeProbability: 0.93,
      runUrl: "https://github.com/metabase/metabase/actions/runs/1",
    });
    expect(body).toContain("`0123456`");
    expect(body).toContain("93% flake probability");
    expect(body).toContain(
      "(https://github.com/metabase/metabase/actions/runs/1)",
    );
  });
});
