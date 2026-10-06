import console from "node:console";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

const GIT_COMMAND = /(^|[\s;&|(`]|\$\()git(\s|$)/;
const SERVER_COMMAND =
  /npm\s+(run\s+)?(dev|build|start)\b|(^|[\s;&|(`/]|\$\()(npx\s+)?vite(\s|$)/;
const WRITE_TOOLS = ["Write", "Edit", "MultiEdit"];
const WRITABLE_FILES = {
  builder: "src/index.tsx",
  tester: "src/index.test.tsx",
};
const VIZ_SOURCE = /(^|[^.\w])index\.tsx/;
const VIZ_DIRECTORY = /(^|[\s/"'])src(\/(?!index\.test\.tsx)|[\s"'*]|$)/;

const toRealPath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : resolve(toRealPath(parent), basename(path));
  }
};

const toProjectPath = (cwd, path) =>
  relative(
    toRealPath(process.env.CLAUDE_PROJECT_DIR ?? cwd),
    toRealPath(resolve(cwd, path)),
  );

const isOutsideProject = (cwd, path) => {
  const target = toProjectPath(cwd, path);
  return target.startsWith("..") || isAbsolute(target);
};

const findOutsideWrite = ({ tool_name, tool_input = {}, cwd = "." }) =>
  WRITE_TOOLS.includes(tool_name) &&
  isOutsideProject(cwd, tool_input.file_path ?? "")
    ? "no agent may edit files outside the project"
    : null;

const findTesterReadViolation = (tool_name, tool_input) => {
  if (VIZ_SOURCE.test(JSON.stringify(tool_input))) {
    return "the tester must not read src/index.tsx; test the build statement";
  }
  if (
    tool_name === "Grep" &&
    !(tool_input.path ?? "").split("/").includes("node_modules")
  ) {
    return "the tester may Grep only node_modules";
  }
  if (tool_name === "Bash" && VIZ_DIRECTORY.test(tool_input.command ?? "")) {
    return "the tester must not read src/ beyond src/index.test.tsx";
  }
  return null;
};

const findSubagentViolation =
  (role) =>
  ({ tool_name, tool_input = {}, cwd = "." }) => {
    if (WRITE_TOOLS.includes(tool_name)) {
      const target = toProjectPath(cwd, tool_input.file_path ?? "");
      return target === WRITABLE_FILES[role]
        ? null
        : `the ${role} may edit only ${WRITABLE_FILES[role]}`;
    }
    if (role === "tester") {
      return findTesterReadViolation(tool_name, tool_input);
    }
    if (tool_name !== "Bash") {
      return null;
    }
    const command = tool_input.command ?? "";
    if (GIT_COMMAND.test(command)) {
      return `the ${role} must not run git`;
    }
    if (SERVER_COMMAND.test(command)) {
      return `the ${role} must not start the dev server or build the archive`;
    }
    return null;
  };

const ROLES = {
  "custom-viz-builder": findSubagentViolation("builder"),
  "custom-viz-tester": findSubagentViolation("tester"),
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
  : (findOutsideWrite(input) ?? ROLES[input.agent_type]?.(input) ?? null);
if (violation) {
  console.error(`Blocked: ${violation}. Follow your phase file.`);
  process.exit(2);
}
