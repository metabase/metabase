/**
 * Module scope uses of underscore's memoize that are known to be bounded.
 *
 * A cache at module scope lives for the life of the tab, so each entry here
 * needs a reason why its set of keys stays small. This list may only grow
 * shorter. If a new call site needs a cache, give the cache a lifetime instead:
 * a Map created per call, a WeakMap keyed on a long-lived object, or a cache
 * built inside the component or instance that uses it.
 */
module.exports = [
  {
    file: "frontend/src/metabase/utils/dom.ts",
    reason:
      "getScrollBarSize takes no arguments, so the cache holds one entry.",
  },
  {
    file: "frontend/src/metabase/querying/expressions/clause.ts",
    reason: "Keyed on the expression mode. There are four of them.",
  },
  {
    file: "frontend/src/metabase/utils/cron.ts",
    reason:
      "Keyed on a cron string. Bounded by the schedules the user opens in one session.",
  },
  {
    file: "frontend/src/metabase/common/components/Schedule/cron.ts",
    reason:
      "Keyed on a cron string. Bounded by the schedules the user opens in one session.",
  },
  {
    file: "frontend/src/metabase/common/components/Schedule/utils.tsx",
    reason:
      "Keyed on a schedule label and font style. The labels are a fixed set.",
  },
];
