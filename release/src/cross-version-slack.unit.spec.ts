import { buildSlackPayload, type FailureResult } from "./cross-version-slack";

const RUN_URL = "https://github.com/metabase/metabase/actions/runs/12345";

describe("cross-version-slack", () => {
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
      expect(blocks[0].text?.text).toContain(
        "HEAD → v1.57.x — migrate down failed",
      );
      expect(blocks[1].text?.text).toContain("E2E failures");
      expect(blocks[1].text?.text).toContain(
        "v1.58.x → HEAD — e2e tests failed after upgrade",
      );
    });

    it("shows only migration section when there are no e2e failures", () => {
      const failures: FailureResult[] = [
        {
          phase: "migration",
          source: "HEAD",
          target: "v1.59.x",
          detail: "migrate down failed: not rolled back. Likely because they are not in the changelog file: v59.2026-03-17T10:30:03",
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

    it("shows generic message when no categorized failures exist", () => {
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

      expect(migrationBlock.text?.text).toContain("HEAD → v1.57.x");
      expect(migrationBlock.text?.text).toContain("HEAD → v1.58.x");
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
