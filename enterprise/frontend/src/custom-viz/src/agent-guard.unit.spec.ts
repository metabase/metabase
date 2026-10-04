import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "dist", "skill", "agent-guard.mjs");

const run = (
  role: string,
  toolName: string,
  toolInput: Record<string, string>,
) =>
  spawnSync(process.execPath, [SCRIPT, role], {
    input: JSON.stringify({
      tool_name: toolName,
      tool_input: toolInput,
      cwd: "/project",
    }),
    encoding: "utf-8",
  }).status;

describe("agent-guard.mjs", () => {
  it.each([
    ["Read", { file_path: "/project/.claude/fix-log.md" }],
    ["Read", { file_path: ".claude/accepted-findings.md" }],
    ["Bash", { command: "cat .claude/fix-log.md" }],
    ["Bash", { command: "git log -p" }],
    ["Bash", { command: "npm run type-check && git diff" }],
    ["Grep", { pattern: "fix", path: ".claude" }],
    ["Grep", { pattern: "fix", path: "/project/.claude/" }],
    ["Grep", { pattern: "fix" }],
    ["Grep", { pattern: "fix", path: "/project" }],
    ["Glob", { pattern: "**/fix-log.md" }],
    ["Bash", { command: "cat .claude/*.md" }],
    ["Bash", { command: "grep -r . .claude" }],
    ["Bash", { command: "npm run type-check | tee out.txt" }],
    ["Bash", { command: "npm run type-check > out.txt" }],
    ["Bash", { command: "ls src" }],
  ])("blocks the verifier: %s %o", (toolName, toolInput) => {
    expect(run("verifier", toolName, toolInput)).toBe(2);
  });

  it.each([
    ["Read", { file_path: "src/index.tsx" }],
    ["Read", { file_path: ".claude/build-statement.md" }],
    ["Bash", { command: "npm run type-check" }],
    [
      "Bash",
      {
        command:
          "node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx",
      },
    ],
    [
      "Bash",
      {
        command:
          "npm run type-check 2>&1 && node verify-tokens.mjs src/index.tsx 2>&1",
      },
    ],
    ["Grep", { pattern: "onHover", path: "src" }],
    ["Grep", { pattern: "onHover", path: "/project/src/index.tsx" }],
  ])("allows the verifier: %s %o", (toolName, toolInput) => {
    expect(run("verifier", toolName, toolInput)).toBe(0);
  });

  it.each(["builder", "fixer"])("guards the %s", (role) => {
    expect(run(role, "Bash", { command: "npm run dev" })).toBe(2);
    expect(run(role, "Bash", { command: "npm run build" })).toBe(2);
    expect(run(role, "Bash", { command: "git checkout ." })).toBe(2);
    expect(run(role, "Bash", { command: "npm start" })).toBe(2);
    expect(run(role, "Bash", { command: "npx vite build --watch" })).toBe(2);
    expect(run(role, "Bash", { command: "cat vite.config.ts" })).toBe(0);
    expect(run(role, "Bash", { command: "npm run type-check" })).toBe(0);
    expect(run(role, "Read", { file_path: ".claude/fix-log.md" })).toBe(0);
    expect(run(role, "Bash", { command: "node_modules/.bin/vite build" })).toBe(
      2,
    );
    expect(run(role, "Edit", { file_path: "src/index.tsx" })).toBe(0);
    expect(run(role, "Write", { file_path: "/project/src/index.tsx" })).toBe(0);
    expect(run(role, "Edit", { file_path: "package.json" })).toBe(2);
    expect(run(role, "Write", { file_path: "src/other.tsx" })).toBe(2);
    expect(run(role, "Edit", { file_path: ".claude/build-statement.md" })).toBe(
      2,
    );
  });

  it("lets only the fixer edit the fix log", () => {
    expect(run("fixer", "Edit", { file_path: ".claude/fix-log.md" })).toBe(0);
    expect(run("builder", "Edit", { file_path: ".claude/fix-log.md" })).toBe(2);
  });

  it("blocks an unknown role", () => {
    expect(run("other", "Read", { file_path: "src/index.tsx" })).toBe(2);
  });
});
