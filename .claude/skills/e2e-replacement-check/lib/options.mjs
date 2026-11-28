export const USAGE = `Usage:
  node .claude/skills/e2e-replacement-check/check.mjs scope   [--base <ref>] [--out <dir>] [--spec <e2e spec path>]...
  node .claude/skills/e2e-replacement-check/check.mjs run     [--base <ref>] [--out <dir>] [--breaks <file>]
                                                              [--auto] [--auto-limit 25] [--backend-limit 2]
                                                              [--no-related] [--related-limit 10] [--no-type-check]
  node .claude/skills/e2e-replacement-check/check.mjs existing [<component, namespace or test path>] [--base <ref>]
  node .claude/skills/e2e-replacement-check/check.mjs restore

See .claude/skills/e2e-replacement-check/README.md.`;

const BOOLEANS = new Set(["--auto", "--no-auto", "--no-related", "--no-type-check"]);
const VALUES = new Set(["--base", "--out", "--breaks", "--spec", "--auto-limit", "--backend-limit", "--related-limit"]);

const count = (name, value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} needs a whole number, not ${JSON.stringify(value)}`);
  }
  return n;
};

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = new Set();
  const values = {};
  const specs = [];
  const paths = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (BOOLEANS.has(a)) {
      flags.add(a);
    } else if (VALUES.has(a)) {
      if (i + 1 >= rest.length) {
        throw new Error(`${a} needs a value\n\n${USAGE}`);
      }
      const value = rest[++i];
      if (a === "--spec") {
        specs.push(...value.split(",").map((x) => x.trim()).filter(Boolean));
      } else {
        values[a.slice(2)] = value;
      }
    } else if (command === "existing" && !a.startsWith("--")) {
      paths.push(a);
    } else {
      throw new Error(`unexpected argument ${a}\n\n${USAGE}`);
    }
  }
  return {
    command,
    base: values.base,
    out: values.out,
    breaks: values.breaks,
    specs,
    paths,
    run: {
      auto: flags.has("--auto") && !flags.has("--no-auto"),
      autoLimit: count("--auto-limit", values["auto-limit"], 25),
      backendLimit: count("--backend-limit", values["backend-limit"], 2),
      related: !flags.has("--no-related"),
      relatedLimit: count("--related-limit", values["related-limit"], 10),
      typeCheck: !flags.has("--no-type-check"),
    },
  };
}
