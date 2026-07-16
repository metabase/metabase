/**
 * Directories enrolled in the fast-test regime: global fake timers and
 * instant userEvent (delay: null).
 *
 * Enrolled specs run with a fully faked clock — no real-time waits (debounce,
 * waitFor polling, userEvent inter-event delays), which makes them faster and
 * deterministic. The cost is that time-dependent behavior must be advanced
 * explicitly; see the fixing playbook below.
 *
 * Enroll a directory by adding its path prefix (repo-relative) once its specs
 * are green under the regime:
 *
 *   bun x jest frontend/src/metabase/<dir>
 *
 * Common fixes when enrolling:
 * 1. Wait for the LOADED state before interacting — `findBy*` + a `waitFor`
 *    on a data-bearing attribute (`toBeChecked`, text from the API), not just
 *    element presence; components often render interactable shells before
 *    their queries resolve.
 * 2. If the component refetches after an update, re-register the mock with
 *    the post-update value before triggering the update
 *    (e.g. `setupPropertiesEndpoints(createMockSettings({ ... }))`).
 * 3. Wrap post-interaction assertions in `waitFor` — it advances the fake
 *    clock; synchronous asserts after a click race timer-gated effects.
 * 4. Tests whose subject IS real timing can opt out with
 *    `jest.useRealTimers()` in the spec.
 */
module.exports = [
  "frontend/src/metabase/admin/settings/components/widgets/UsageTracking",
];
