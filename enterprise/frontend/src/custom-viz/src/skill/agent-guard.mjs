import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const GIT_COMMAND = /(^|[\s;&|(`]|\$\()git(\s|$)/;
const SERVER_COMMAND =
  /npm\s+(run\s+)?(dev|build|start)\b|(^|[\s;&|(`/]|\$\()(npx\s+)?vite(\s|$)/;
const WRITE_TOOLS = ["Write", "Edit", "MultiEdit"];
const WRITABLE_FILE = "src/index.tsx";

const findBuilderViolation = ({ tool_name, tool_input = {}, cwd = "." }) => {
  if (WRITE_TOOLS.includes(tool_name)) {
    const target = relative(cwd, resolve(cwd, tool_input.file_path ?? ""));
    return target === WRITABLE_FILE
      ? null
      : `the builder may edit only ${WRITABLE_FILE}`;
  }
  if (tool_name !== "Bash") {
    return null;
  }
  const command = tool_input.command ?? "";
  if (GIT_COMMAND.test(command)) {
    return "the builder must not run git";
  }
  if (SERVER_COMMAND.test(command)) {
    return "the builder must not start the dev server or build the archive";
  }
  return null;
};

const readInput = () => {
  try {
    return JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    return null;
  }
};

const input = readInput();
const violation = !input
  ? "agent-guard could not parse the hook input"
  : input.agent_type === "custom-viz-builder"
    ? findBuilderViolation(input)
    : null;
if (violation) {
  console.error(`Blocked: ${violation}. Follow your phase file.`);
  process.exit(2);
}
