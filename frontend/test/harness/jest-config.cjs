// The parts of the jest config that the harness needs. They are read from the
// config itself, so the harness cannot fall behind it.
const fs = require("node:fs");
const path = require("node:path");

// The repository root is the nearest directory above this one that holds the
// jest config.
const root = (() => {
  let directory = __dirname;
  while (!fs.existsSync(path.join(directory, "jest.config.js"))) directory = path.dirname(directory);
  return directory;
})();
const config = require(path.join(root, "jest.config.js"));
const fromRoot = (value) => value.replace(/<rootDir>/g, root);

// jest matches testMatch with micromatch, which is not a direct dependency.
const micromatch = (() => {
  const store = path.join(root, "node_modules/.bun");
  const directory = fs.existsSync(store) && fs.readdirSync(store).find((name) => name.startsWith("micromatch@"));
  return require(directory ? path.join(store, directory, "node_modules/micromatch") : "micromatch");
})();

const projects = config.projects.map((project) => {
  const testMatch = (project.testMatch ?? []).map(fromRoot);
  const ignored = (project.testPathIgnorePatterns ?? []).map((pattern) => new RegExp(fromRoot(pattern)));
  return {
    name: project.displayName,
    matches: (file) => micromatch.isMatch(file, testMatch) && !ignored.some((pattern) => pattern.test(file)),
    // The keys are regular expressions without anchors, and the values may use
    // the groups of the match.
    moduleNameMapper: Object.entries(project.moduleNameMapper ?? {}).map(([pattern, target]) => [new RegExp(pattern), fromRoot(target)]),
    modulePaths: (project.modulePaths ?? []).map(fromRoot),
    setupFiles: [...(project.setupFiles ?? []), ...(project.setupFilesAfterEnv ?? [])].map(fromRoot),
    transform: Object.keys(project.transform ?? {}).map((pattern) => new RegExp(pattern)),
    transformIgnorePatterns: (project.transformIgnorePatterns ?? []).map((pattern) => new RegExp(fromRoot(pattern))),
    globals: project.globals ?? {},
  };
});

module.exports = {
  root,
  testTimeout: config.testTimeout,
  projects,
  projectOf: (file) => projects.find((project) => project.matches(path.resolve(root, file))),
};
