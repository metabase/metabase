import {
  buildFailureResults,
  buildSlackPayload,
  parseJobName,
  type FailedJob,
  type FailureResult,
} from "./cross-version-slack";

const RUN_URL = "https://github.com/metabase/metabase/actions/runs/12345";

describe("cross-version-slack", () => {
  describe("parseJobName", () => {
    it("parses source and target from matrix job name", () => {
      expect(parseJobName("test-matrix (HEAD, v1.59.x)")).toEqual({
        source: "HEAD",
        target: "v1.59.x",
      });
    });

    it("handles version-to-HEAD format", () => {
      expect(parseJobName("test-matrix (v1.58.x, HEAD)")).toEqual({
        source: "v1.58.x",
        target: "HEAD",
      });
    });

    it("returns null for unparseable names", () => {
      expect(parseJobName("generate-matrix")).toBeNull();
    });
  });

  describe("buildFailureResults", () => {
    it("enriches jobs with artifact data when available", () => {
      const failedJobs: FailedJob[] = [
        { name: "test-matrix (HEAD, v1.59.x)", url: "https://job/1" },
      ];
      const artifactData = new Map<string, FailureResult>([
        [
          "HEAD-v1.59.x",
          {
            phase: "migration",
            source: "HEAD",
            target: "v1.59.x",
          },
        ],
      ]);

      const results = buildFailureResults(failedJobs, artifactData);

      expect(results).toHaveLength(1);
      expect(results[0].phase).toBe("migration");
      expect(results[0].jobUrl).toBe("https://job/1");
    });

    it("defaults to e2e phase when no artifact exists", () => {
      const failedJobs: FailedJob[] = [
        { name: "test-matrix (v1.58.x, HEAD)", url: "https://job/2" },
      ];

      const results = buildFailureResults(failedJobs, new Map());

      expect(results).toHaveLength(1);
      expect(results[0].phase).toBe("e2e");
      expect(results[0].source).toBe("v1.58.x");
      expect(results[0].target).toBe("HEAD");
    });
  });

  describe("buildSlackPayload", () => {
    it("lists failures with phase labels", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.59.x",
          jobUrl: "https://job/1",
        },
        {
          phase: "e2e",
          source: "v1.58.x",
          target: "HEAD",
          jobUrl: "https://job/2",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const text = payload.blocks[0].text?.text ?? "";

      expect(text).toContain("Cross-version tests failing");
      expect(text).toContain("<https://job/1|HEAD → v1.59.x> (migration failure)");
      expect(text).toContain("<https://job/2|v1.58.x → HEAD> (e2e failure)");
      expect(text).toContain("View full run");
    });

    it("shows generic message when no failures exist", () => {
      const payload = buildSlackPayload([], RUN_URL);
      const text = payload.blocks[0].text?.text ?? "";

      expect(text).toContain("One or more matrix jobs failed");
    });

    it("renders as a single block", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.59.x",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      expect(payload.blocks).toHaveLength(1);
    });
  });
});
