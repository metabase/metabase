// Tiny JS resource used by metabase.channel.render.js.engine-test to exercise `load-resource` against the
// UNTRUSTED isolate. Kept trivial on purpose — the test asserts the resource loads (marshals) at all.
function engine_test_plus(x, y) {
  return x + y;
}
