// The parts of the jest config that the runner needs. They are read from the
// config itself, so the runner cannot fall behind it.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import micromatch from "micromatch";

// The fields of jest's config that the runner reads.
type ProjectOptions = {
  displayName?: string | { name: string };
  testMatch?: string[];
  testPathIgnorePatterns?: string[];
  moduleNameMapper?: Record<string, string | string[]>;
  modulePaths?: string[];
  setupFiles?: string[];
  setupFilesAfterEnv?: string[];
  transform?: Record<string, unknown>;
  transformIgnorePatterns?: string[];
  globals?: Record<string, unknown>;
};

type JestConfig = {
  testTimeout?: number;
  projects?: Array<string | ProjectOptions>;
};

export type Project = {
  name: string;
  matches: (file: string) => boolean;
  /**
   * Patterns without anchors, and targets that may use the groups of the
   * match.
   */
  moduleNameMapper: Array<[RegExp, string]>;
  modulePaths: string[];
  /**
   * setupFiles, then setupFilesAfterEnv, as jest runs them.
   */
  setupFiles: string[];
  transform: RegExp[];
  transformIgnorePatterns: RegExp[];
  globals: Record<string, unknown>;
};

/**
 * The nearest directory above this one that holds the jest config.
 */
export const root = findRoot(import.meta.dirname);

/**
 * The runner's own files, which Node loads as they are and never evicts.
 */
export const runnerDirectory = import.meta.dirname;

const require = createRequire(import.meta.url);
// jest.config.js is plain CommonJS, and jest validates it against its own
// schema, of which this reads a small part.
const config: JestConfig = require(path.join(root, "jest.config.js"));

export const testTimeoutMs = config.testTimeout;

export const projects: Project[] = (config.projects ?? [])
  .filter((project) => typeof project !== "string")
  .map(readProject);

export function projectOf(file: string): Project | undefined {
  const absolute = path.resolve(root, file);
  return projects.find((project) => project.matches(absolute));
}

/**
 * Whether jest transforms the file in this project. Packages are the
 * exception: Node loads them as they are.
 */
export function transforms(project: Project, file: string): boolean {
  return (
    file.startsWith(root + path.sep) &&
    !file.startsWith(runnerDirectory + path.sep) &&
    !file.includes(`${path.sep}node_modules${path.sep}`) &&
    project.transform.some((pattern) => pattern.test(file)) &&
    !project.transformIgnorePatterns.some((pattern) => pattern.test(file))
  );
}

/**
 * A file that jest transforms is the project's own code. A worker evaluates it
 * again for each spec file, and loads everything else only once.
 */
export function isProjectSource(file: string): boolean {
  return projects.some((project) => transforms(project, file));
}

/**
 * The directories that a module name is mapped into with a pattern, such as a
 * build output.
 */
export const mappedDirectories = [
  ...new Set(
    projects
      .flatMap((project) => project.moduleNameMapper)
      .map(([, target]) => target)
      .filter((target) => target.includes("$"))
      .map((target) => path.dirname(target.slice(0, target.indexOf("$") + 1))),
  ),
];

function findRoot(start: string): string {
  let directory = start;
  while (!fs.existsSync(path.join(directory, "jest.config.js"))) {
    directory = path.dirname(directory);
  }
  return directory;
}

function fromRoot(value: string): string {
  return value.replace(/<rootDir>/g, root);
}

function displayNameOf(project: ProjectOptions): string {
  const { displayName } = project;
  return typeof displayName === "string"
    ? displayName
    : (displayName?.name ?? "");
}

function readProject(project: ProjectOptions): Project {
  const testMatch = (project.testMatch ?? []).map(fromRoot);
  const ignored = (project.testPathIgnorePatterns ?? []).map(
    (pattern) => new RegExp(fromRoot(pattern)),
  );
  return {
    name: displayNameOf(project),
    matches: (file) =>
      micromatch.isMatch(file, testMatch) &&
      !ignored.some((pattern) => pattern.test(file)),
    moduleNameMapper: Object.entries(project.moduleNameMapper ?? {}).map(
      ([pattern, target]): [RegExp, string] => [
        new RegExp(pattern),
        fromRoot(Array.isArray(target) ? target[0] : target),
      ],
    ),
    modulePaths: (project.modulePaths ?? []).map(fromRoot),
    setupFiles: [
      ...(project.setupFiles ?? []),
      ...(project.setupFilesAfterEnv ?? []),
    ].map(fromRoot),
    transform: Object.keys(project.transform ?? {}).map(
      (pattern) => new RegExp(pattern),
    ),
    transformIgnorePatterns: (project.transformIgnorePatterns ?? []).map(
      (pattern) => new RegExp(fromRoot(pattern)),
    ),
    globals: project.globals ?? {},
  };
}
