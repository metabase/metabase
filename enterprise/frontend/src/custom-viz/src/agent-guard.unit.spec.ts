import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "dist", "skill", "agent-guard.mjs");

const run = (
  agentType: string | null,
  toolName: string,
  toolInput: Record<string, string>,
) =>
  spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      ...(agentType ? { agent_type: agentType } : {}),
      tool_name: toolName,
      tool_input: toolInput,
      cwd: "/project",
    }),
    encoding: "utf-8",
  }).status;

const runBuilder = (toolName: string, toolInput: Record<string, string>) =>
  run("custom-viz-builder", toolName, toolInput);

describe("agent-guard.mjs", () => {
  it.each([
    ["Bash", { command: "npm run dev" }],
    ["Bash", { command: "npm run build" }],
    ["Bash", { command: "npm start" }],
    ["Bash", { command: "npx vite build --watch" }],
    ["Bash", { command: "node_modules/.bin/vite build" }],
    ["Bash", { command: "git checkout ." }],
    ["Bash", { command: "npm run type-check && git diff" }],
    ["Edit", { file_path: "package.json" }],
    ["Write", { file_path: "src/other.tsx" }],
    ["Edit", { file_path: ".claude/build-statement.md" }],
    ["Edit", { file_path: ".claude/fix-log.md" }],
  ])("blocks the builder: %s %o", (toolName, toolInput) => {
    expect(runBuilder(toolName, toolInput)).toBe(2);
  });

  it.each([
    ["Edit", { file_path: "src/index.tsx" }],
    ["Write", { file_path: "/project/src/index.tsx" }],
    ["Read", { file_path: ".claude/build-statement.md" }],
    ["Bash", { command: "npm run type-check" }],
    ["Bash", { command: "cat vite.config.ts" }],
  ])("allows the builder: %s %o", (toolName, toolInput) => {
    expect(runBuilder(toolName, toolInput)).toBe(0);
  });

  it.each([null, "other"])("does not guard agent %s", (agentType) => {
    expect(run(agentType, "Bash", { command: "npm run dev" })).toBe(0);
    expect(run(agentType, "Edit", { file_path: "package.json" })).toBe(0);
  });

  it("blocks unparsable input", () => {
    expect(
      spawnSync(process.execPath, [SCRIPT], { input: "nope" }).status,
    ).toBe(2);
  });
});
