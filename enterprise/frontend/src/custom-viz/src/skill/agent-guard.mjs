import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const HIDDEN_FILES = /fix-log\.md|accepted-findings\.md/;
const GIT_COMMAND = /(^|[\s;&|(`]|\$\()git(\s|$)/;
const SERVER_COMMAND =
  /npm\s+(run\s+)?(dev|build|start)\b|(^|[\s;&|(`/]|\$\()(npx\s+)?vite(\s|$)/;
const CHECK_COMMANDS = [
  /^npm run type-check$/,
  /^node (\S*\/)?verify-tokens\.mjs src\/index\.tsx$/,
];
const SHELL_ESCAPES = /[|>`<]|\$\(/;
const WRITE_TOOLS = ["Write", "Edit", "MultiEdit"];
const WRITABLE_FILES = {
  builder: ["src/index.tsx"],
  fixer: ["src/index.tsx", ".claude/fix-log.md"],
};

const isOutsideClaudeDir = (cwd, path) => {
  const target = relative(cwd, resolve(cwd, path));
  return target !== "" && !target.split("/").includes(".claude");
};

const isCheckCommand = (command) =>
  command
    .split(/&&|;/)
    .map((part) => part.trim().replace(/\s*2>&1$/, ""))
    .every(
      (part) =>
        !SHELL_ESCAPES.test(part) &&
        CHECK_COMMANDS.some((pattern) => pattern.test(part)),
    );

const findWriterViolation =
  (role) =>
  ({ tool_name, tool_input = {}, cwd = "." }) => {
    if (WRITE_TOOLS.includes(tool_name)) {
      const target = relative(cwd, resolve(cwd, tool_input.file_path ?? ""));
      return WRITABLE_FILES[role].includes(target)
        ? null
        : `the ${role} may edit only ${WRITABLE_FILES[role].join(", ")}`;
    }
    if (tool_name !== "Bash") {
      return null;
    }
    const command = tool_input.command ?? "";
    if (GIT_COMMAND.test(command)) {
      return "subagents must not run git";
    }
    if (SERVER_COMMAND.test(command)) {
      return "subagents must not start the dev server or build the archive";
    }
    return null;
  };

const findVerifierViolation = ({ tool_name, tool_input = {}, cwd = "." }) => {
  if (HIDDEN_FILES.test(JSON.stringify(tool_input))) {
    return "the verifier must not read the fix log or accepted findings";
  }
  if (tool_name === "Grep" && !isOutsideClaudeDir(cwd, tool_input.path ?? "")) {
    return "the verifier must Grep a path outside .claude/, e.g. src/";
  }
  if (tool_name === "Bash" && !isCheckCommand(tool_input.command ?? "")) {
    return "the verifier runs only the Checks commands from project.md";
  }
  return null;
};

const ROLES = {
  builder: findWriterViolation("builder"),
  fixer: findWriterViolation("fixer"),
  verifier: findVerifierViolation,
};

const findViolation = ROLES[process.argv[2]];
const violation = findViolation
  ? findViolation(JSON.parse(readFileSync(0, "utf-8")))
  : `unknown agent-guard role "${process.argv[2]}"`;
if (violation) {
  console.error(`Blocked: ${violation}. Follow your phase file.`);
  process.exit(2);
}
