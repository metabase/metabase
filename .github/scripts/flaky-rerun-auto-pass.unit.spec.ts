import {
  autoPassComment,
  decideAutoPass,
  failedJobNames,
  fetchFlakeProbability,
  formatPercent,
  jobNamesToPass,
  readContext,
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
    RUN_EVENT: "pull_request",
    RUN_ID: "123",
    RUN_ATTEMPT: "2",
    PR_NUMBER: "82887",
    HEAD_SHA: SHA,
    PR_AUTHOR: "octocat",
    CI_CONDUCTOR_BASE_URL: "https://conductor.example.com",
    CI_CONDUCTOR_WEBHOOK_SECRET: "secret",
  };

  it("reads a PR re-run", () => {
    expect(readContext(env)).toEqual({
      runId: 123,
      runAttempt: 2,
      prNumber: 82887,
      headSha: SHA,
      author: "octocat",
      baseUrl: "https://conductor.example.com",
      secret: "secret",
    });
  });

  it.each([
    ["a push", { RUN_EVENT: "push" }],
    ["a first attempt", { RUN_ATTEMPT: "1" }],
    ["a missing run id", { RUN_ID: "" }],
    ["a missing PR number", { PR_NUMBER: "" }],
    ["a missing head sha", { HEAD_SHA: "" }],
    ["a missing secret (fork PRs)", { CI_CONDUCTOR_WEBHOOK_SECRET: "" }],
    ["a missing base URL", { CI_CONDUCTOR_BASE_URL: "" }],
  ])("skips %s", (_, override) => {
    expect(readContext({ ...env, ...override })).toHaveProperty("skip");
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

describe("jobNamesToPass", () => {
  it("passes the previous failures and every job the cancel left unpassed", () => {
    expect(
      jobNamesToPass(
        [
          { name: "backend-tests / be-tests (1)", conclusion: "failure" },
          { name: "backend-tests / be-tests-result", conclusion: "failure" },
          { name: "frontend-tests / fe-tests-result", conclusion: "success" },
          {
            name: "sdk-tests / embedding-sdk-tests-result",
            conclusion: "skipped",
          },
        ],
        [
          { name: "backend-tests / be-tests (1)", conclusion: "cancelled" },
          { name: "backend-tests / be-tests-result", conclusion: "skipped" },
          { name: "frontend-tests / fe-tests-result", conclusion: "cancelled" },
          {
            name: "sdk-tests / embedding-sdk-tests-result",
            conclusion: "cancelled",
          },
          { name: "loki-tests / visual-test", conclusion: "success" },
          { name: "driver-tests / be-tests-oracle", conclusion: "skipped" },
          { name: "e2e-tests / e2e-tests-result", conclusion: null },
        ],
      ),
    ).toEqual([
      "backend-tests / be-tests (1)",
      "backend-tests / be-tests-result",
      "frontend-tests / fe-tests-result",
      "sdk-tests / embedding-sdk-tests-result",
      "e2e-tests / e2e-tests-result",
    ]);
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
