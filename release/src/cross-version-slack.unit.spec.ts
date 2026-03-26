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

    it("defaults to e2e phase when no artifact exists", () => {
      const failedJobs: FailedJob[] = [
        { name: "test-matrix (v1.58.x, HEAD)", url: "https://job/2" },
      ];

      const results = buildFailureResults(failedJobs, new Map());

      expect(results).toHaveLength(1);
      expect(results[0].phase).toBe("e2e");
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
    });
  });

  describe("buildSlackPayload", () => {
    it("creates one attachment per failure with correct colors", () => {
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

      expect(payload.attachments).toHaveLength(2);
      expect(payload.attachments[0].color).toBe("#f85149"); // red
      expect(payload.attachments[0].blocks[0].text?.text).toContain(
        "Migration failures",
      );
      expect(payload.attachments[1].color).toBe("#ffce33"); // yellow
      expect(payload.attachments[1].blocks[0].text?.text).toContain(
        "E2E failures",
      );
    });

    it("includes changeset detail in migration failure", () => {
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

      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].blocks[0].text?.text).toContain(
        "not rolled back",
      );
    });

    it("shows generic message when no failures exist", () => {
      const payload = buildSlackPayload([], RUN_URL);

      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].blocks[0].text?.text).toContain(
        "One or more matrix jobs failed",
      );
    });

    it("includes job URLs as links when provided", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.59.x",
          detail: "migrate down failed",
          jobUrl:
            "https://github.com/metabase/metabase/actions/runs/123/job/456",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);

      expect(payload.attachments[0].blocks[0].text?.text).toContain(
        "<https://github.com/metabase/metabase/actions/runs/123/job/456|HEAD → v1.59.x>",
      );
    });

    it("appends 'View full run' to the last attachment", () => {
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
          detail: "e2e tests failed",
        },
      ];

      const payload = buildSlackPayload(failures, RUN_URL);

      // First attachment: no context block
      expect(payload.attachments[0].blocks).toHaveLength(1);
      // Last attachment: has context block
      const lastAttachment =
        payload.attachments[payload.attachments.length - 1];
      const lastBlock = lastAttachment.blocks[lastAttachment.blocks.length - 1];
      expect(lastBlock.type).toBe("context");
      expect(lastBlock.elements?.[0].text).toContain("View full run");
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
  });
});
