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
      expect(parseJobName("notify-on-failure")).toBeNull();
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
            detail: "migrate down failed: not rolled back",
          },
        ],
      ]);

      const results = buildFailureResults(failedJobs, artifactData);

      expect(results).toHaveLength(1);
      expect(results[0].phase).toBe("migration");
      expect(results[0].detail).toBe("migrate down failed: not rolled back");
      expect(results[0].jobUrl).toBe("https://job/1");
    });

    it("falls back to unknown when no artifact exists", () => {
      const failedJobs: FailedJob[] = [
        { name: "test-matrix (v1.58.x, HEAD)", url: "https://job/2" },
      ];

      const results = buildFailureResults(failedJobs, new Map());

      expect(results).toHaveLength(1);
      expect(results[0].phase).toBe("unknown");
      expect(results[0].source).toBe("v1.58.x");
      expect(results[0].target).toBe("HEAD");
      expect(results[0].detail).toBe("check job logs for details");
    });

    it("handles all failed jobs including those without parseable names", () => {
      const failedJobs: FailedJob[] = [
        { name: "test-matrix (HEAD, v1.59.x)", url: "https://job/1" },
        { name: "test-matrix (v1.58.x, HEAD)", url: "https://job/2" },
        { name: "something-else", url: "https://job/3" },
      ];

      const results = buildFailureResults(failedJobs, new Map());

      expect(results).toHaveLength(3);
      expect(results[2].phase).toBe("unknown");
      expect(results[2].detail).toBe("something-else");
    });
  });

  describe("buildSlackPayload", () => {
    it("categorizes migration and e2e failures separately", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.57.x",
          detail: "migrate down failed",
        },
        {
          phase: "e2e",
          source: "v1.58.x",
          target: "HEAD",
          detail: "e2e tests failed after upgrade",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const blocks = payload.attachments[0].blocks;

      expect(blocks).toHaveLength(3); // migration + e2e + context
      expect(blocks[0].text?.text).toContain("Migration failures");
      expect(blocks[0].text?.text).toContain("migrate down failed");
      expect(blocks[1].text?.text).toContain("E2E failures");
      expect(blocks[1].text?.text).toContain("e2e tests failed after upgrade");
    });

    it("shows only migration section when there are no e2e failures", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.59.x",
          detail:
            "migrate down failed: not rolled back. Likely because they are not in the changelog file: v59.2026-03-17T10:30:03",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const blocks = payload.attachments[0].blocks;

      expect(blocks).toHaveLength(2); // migration + context
      expect(blocks[0].text?.text).toContain("Migration failures");
      expect(blocks[0].text?.text).toContain("not rolled back");
    });

    it("shows only e2e section when there are no migration failures", () => {
      const failures: FailureResult[] = [
        {
          phase: "e2e",
          source: "v1.58.x",
          target: "HEAD",
          detail: "e2e tests failed after upgrade",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const blocks = payload.attachments[0].blocks;

      expect(blocks).toHaveLength(2); // e2e + context
      expect(blocks[0].text?.text).toContain("E2E failures");
    });

    it("shows unknown failures in a separate section", () => {
      const failures: FailureResult[] = [
        {
          phase: "unknown",
          source: "HEAD",
          target: "v1.58.x",
          detail: "check job logs for details",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const blocks = payload.attachments[0].blocks;

      expect(blocks).toHaveLength(2); // unknown + context
      expect(blocks[0].text?.text).toContain("Other failures");
    });

    it("shows generic message when no failures exist", () => {
      const payload = buildSlackPayload([], RUN_URL);
      const blocks = payload.attachments[0].blocks;

      expect(blocks).toHaveLength(2); // generic + context
      expect(blocks[0].text?.text).toContain(
        "One or more matrix jobs failed",
      );
    });

    it("groups multiple failures of the same type", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.57.x",
          detail: "migrate down failed",
        },
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.58.x",
          detail: "migrate down failed",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const migrationBlock = payload.attachments[0].blocks[0];

      expect(migrationBlock.text?.text).toContain("v1.57.x");
      expect(migrationBlock.text?.text).toContain("v1.58.x");
    });

    it("includes job URLs as links when provided", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.59.x",
          detail: "migrate down failed",
          jobUrl: "https://github.com/metabase/metabase/actions/runs/123/job/456",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      const block = payload.attachments[0].blocks[0];

      expect(block.text?.text).toContain("<https://github.com/metabase/metabase/actions/runs/123/job/456|HEAD → v1.59.x>");
    });

    it("includes a link to the workflow run", () => {
      const payload = buildSlackPayload([], RUN_URL);
      const blocks = payload.attachments[0].blocks;
      const contextBlock = blocks[blocks.length - 1];

      expect(contextBlock.type).toBe("context");
      expect(contextBlock.elements?.[0].text).toContain(RUN_URL);
      expect(contextBlock.elements?.[0].text).toContain("View full run");
    });

    it("always starts with a header block", () => {
      const payload = buildSlackPayload([], RUN_URL);

      expect(payload.blocks[0]).toEqual({
        type: "header",
        text: {
          type: "plain_text",
          text: ":warning: Cross-version tests failing",
          emoji: true,
        },
      });
    });

    it("uses red color when there are migration failures", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.57.x",
          detail: "migrate down failed",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      expect(payload.attachments[0].color).toBe("#f85149");
    });

    it("uses yellow color for e2e-only failures", () => {
      const failures: FailureResult[] = [
        {
          phase: "e2e",
          source: "v1.58.x",
          target: "HEAD",
          detail: "e2e tests failed after upgrade",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      expect(payload.attachments[0].color).toBe("#ffce33");
    });

    it("uses red color when both migration and e2e failures exist", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.57.x",
          detail: "migrate down failed",
        },
        {
          phase: "e2e",
          source: "v1.58.x",
          target: "HEAD",
          detail: "e2e tests failed after upgrade",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);
      expect(payload.attachments[0].color).toBe("#f85149");
    });
  });
});
