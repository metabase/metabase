/**
 * @fileoverview Re-publishes jest/no-conditional-expect under the metabase namespace.
 *
 * oxlint implements `jest/no-conditional-expect` natively, but its version
 * reports any `expect()` inside a conditional, including setup helpers that are
 * not test callbacks at all (10 false positives here). The upstream rule only
 * inspects code reachable from an `it`/`test` callback.
 *
 * `jest` is a reserved namespace, so the rule cannot keep its original name.
 * Disable comments name it `metabase/no-conditional-expect`.
 */

module.exports = require("eslint-plugin-jest").rules["no-conditional-expect"];
