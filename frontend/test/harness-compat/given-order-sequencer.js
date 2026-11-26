// Runs the spec files in the order of HARNESS_COMPAT_ORDER, a JSON list of
// their paths, instead of jest's order, which depends on earlier runs.
const { createRequire } = require("node:module");

const requireFromJest = createRequire(require.resolve("jest"));
const Sequencer = requireFromJest("@jest/test-sequencer").default;

module.exports = class GivenOrderSequencer extends Sequencer {
  sort(tests) {
    const order = JSON.parse(process.env.HARNESS_COMPAT_ORDER ?? "[]");
    return [...tests].sort(
      (a, b) => order.indexOf(a.path) - order.indexOf(b.path),
    );
  }
};
