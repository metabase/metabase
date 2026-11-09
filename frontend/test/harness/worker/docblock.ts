// The pragmas in a spec file's leading comment that change its environment,
// read with jest's own parser.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type Pragmas = Record<string, string | string[]>;

const requireFromJestCore = createRequire(
  createRequire(import.meta.url).resolve("@jest/core", {
    paths: [path.dirname(createRequire(import.meta.url).resolve("jest"))],
  }),
);
const docblock: {
  extract: (source: string) => string;
  parse: (comment: string) => Pragmas;
} = requireFromJestCore("jest-docblock");

/**
 * The jsdom options of a spec file's @jest-environment-options pragma, which
 * jest adds to the project's. A worker serves one project and its
 * environment, so a file that names another one with @jest-environment, or
 * other export conditions, fails instead of running in the wrong one.
 */
export function environmentOptionsOf(file: string): Record<string, unknown> {
  const pragmas = docblock.parse(
    docblock.extract(fs.readFileSync(file, "utf8")),
  );
  if (pragmas["jest-environment"] !== undefined) {
    throw new Error(
      "The node:test runner runs each jest project in one environment, so it does not support @jest-environment. Move the spec to a project with that environment.",
    );
  }
  const json = [pragmas["jest-environment-options"] ?? []].flat()[0];
  if (json === undefined) {
    return {};
  }
  const options: unknown = JSON.parse(json);
  if (typeof options !== "object" || options === null) {
    throw new Error("@jest-environment-options must be a JSON object");
  }
  if ("customExportConditions" in options) {
    throw new Error(
      "The node:test runner resolves modules for a whole worker, so it does not support customExportConditions in @jest-environment-options.",
    );
  }
  return { ...options };
}
