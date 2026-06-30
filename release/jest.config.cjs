module.exports = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transformIgnorePatterns: [],
  // ci-conductor is a separate bun package with its own `bun test`; keep
  // release's jest out of it (its bun:test files can't load under jest, and
  // junit.test.ts otherwise matches `--testPathPattern unit`).
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/ci-conductor/"],
};
