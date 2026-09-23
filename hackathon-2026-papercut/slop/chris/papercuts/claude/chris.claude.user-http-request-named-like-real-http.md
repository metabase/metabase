---
title: mt/user-http-request is an in-process mock, but its name, the client docstring examples and copied comments say "real HTTP on a Jetty thread"
slug: user-http-request-named-like-real-http
kind: codebase-trap
impact: both
severity: high
status: documented-still-hit
area: test/metabase/test/http_client.clj, test/metabase/test/data/users.clj, with-redefs -> with-dynamic-fn-redefs conversions
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl
    lines: 540-816
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.59, misleading_signal: 0.82, user_correction: 0.14, codebase_trap: 0.93, flailing: 0.62, env_friction: 0.75}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-a6d2ac451ce31ca33.jsonl
    lines: 489-586
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.82, tool_misuse: 0.22, misleading_signal: 0.60, user_correction: 0.86, codebase_trap: 0.88, flailing: 0.35, env_friction: 0.82}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-ad334f260d4e69004.jsonl
    lines: 439-503
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.22, misleading_signal: 0.66, user_correction: 0.85, codebase_trap: 0.89, flailing: 0.46, env_friction: 0.57}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-adc0757a6d63f0c93.jsonl
    lines: 292-316
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.89, misleading_signal: 0.91, user_correction: 0.74, codebase_trap: 0.88, flailing: 0.55, env_friction: 0.88}
---
## Summary
While converting ~310 `with-redefs` forms to `mt/with-dynamic-fn-redefs` (PR #82388), four parallel subagents had to decide, per site, whether the redefined fn runs on a thread that inherits dynamic bindings. Three of the four concluded that `mt/user-http-request` issues a real HTTP request served on a Jetty worker thread, and kept 22 sites on `with-redefs` with `#_{:clj-kondo/ignore ...}` plus a why-comment asserting that. It is false: `user-http-request` is `(partial user-request client/client)`, and `client` runs `@(future (-mock-client parsed))`, which invokes the ring handler in-process; `future` conveys bindings. All 22 converted and passed once corrected. The coordinator itself then nearly over-corrected, because the real-HTTP entry point `client-real-response` sits next to the mock `client-full-response`.

## Symptom
- Batch B suppressed 7 sites, batch C 9, batch D 6, all citing "real HTTP on Jetty worker threads" (parent L649: "All 22 suppressions citing the Jetty premise are **new** — `HEAD=0` in every file").
- Batch A reached the opposite conclusion for the same function and converted its sites, so the coordinator saw two directly contradictory claims (L569).
- After the fix, the coordinator's own grep for real-HTTP callers (`real-client`, `user-real-request`) missed `client-real-response`, so it briefly doubted the correct SSO suppressions (L730).

## Timeline
- Parent L569: "batch A and batch B make directly contradictory claims about the same function. A said `mt/user-http-request` runs the handler inside a `future` ... B said it's a real clj-http call to the embedded Jetty server".
- Parent L570-L593: greps `build-url`, `localhost`, `-mock-client` in http_client.clj.
- Parent L629: "`user-http-request` is `(partial user-request client/client)` — the mock client — and its own docstring says 'this makes a mock API call, not an actual HTTP call'... B appears to have misread `build-url`'s `http://localhost:<port>` string — which only the real client uses — as proof of a real HTTP call."
- Parent L649: 22 new suppressions on the false premise, plus 6 fabricated `[kondo-keep]` markers (see separate papercut).
- Parent L695: verifies `streaming-response` wraps its body in `bound-fn` (streaming_response.clj:504), closing the "streaming endpoint runs on another pool" escape route.
- Parent L730: "the naming is treacherous: `client-full-response` is mock, `client-real-response` is real ... my earlier per-file greps used patterns (`real-client`, `user-real-request`) that would **miss** `client-real-response` entirely."
- Subagent B L524: "I read `-client` (the real path, which builds the `localhost:<port>` URL) and wrongly assumed `client` routed through it."
- Subagent D L439/L455: "My 'real HTTP / Jetty worker thread' premise came from `build-url` producing a `http://localhost:<port>` string — I never traced which client actually consumes it."
- Subagent C L300: "Verified from source — the coordinator is right and my Jetty claim was wrong".
- Memory note written afterwards says a pre-existing comment at `field_test.clj:891` claimed the same false thing and "it spread".

## Root cause
Several independent signals all point the wrong way:
1. The var name `user-http-request` says HTTP.
2. `client`'s docstring examples read `; GET  http://localhost:3000/api/card/1` (test/metabase/test/http_client.clj:509-518), i.e. they describe real HTTP URLs.
3. The private real implementation is named `-client` (http_client.clj:312), one character from the public mock `client` (509). Reading `-client` shows `build-url` + clj-http.
4. The full-response pair is asymmetric: `client-full-response` (484) is mock, `client-real-response` (500) is real; `user-http-request-full-response` is mock, `user-real-request-full-response` is real.
5. `client`'s docstring says "the call site and API execution are on the same thread", but the code runs the handler in a `future` (another thread that conveys bindings). An agent reasoning about threads gets the wrong model either way.
6. Existing why-comments in test files asserting the Jetty premise were copied as precedent.

## Why agents fall for it
The thread question can't be answered from the call site; it needs a trace through two indirections (`partial user-request client/client` -> `client-full-response` -> `future` -> `-mock-client`). Agents grep for `http`, `localhost`, `build-url` and land in `-client`. Nothing in CI checks a suppression's thread claim, and the converted-vs-suppressed tests both pass, so the wrong choice is silent.

## Current state
- Still exists in code: `test/metabase/test/http_client.clj:312` `-client` (real) vs `:509` `client` (mock); docstring examples at ~:514-516 still show `http://localhost:3000/...`; `client-full-response` (484, mock) vs `client-real-response` (500, real). `test/metabase/test/data/users.clj:253-278` has the four `user-*-request` partials; only `user-http-request`'s docstring (260) says "mock API call".
- The false comments from this session were removed before merge (#82388, aecbc3c3cbd). Remaining "Jetty handler thread" comments on master (e.g. `test/metabase/session/api_test.clj:626`, `sso/integrations/slack_connect_test.clj:305`, `premium_features/api_test.clj:80`) cite `client-real-response`/`user-real-request` and are correct.
- Documented in memory: `~/.claude/projects/-Users-christruter-workspace-metabase-metabase/memory/reference_mt_user_http_request_is_mock.md` (written at the end of this session). The `with-dynamic-fn-redefs` docstring (test/metabase/test/util/dynamic_redefs.clj:85-99) lists which thread hops convey bindings but does not mention the test client.

## Suggested fix
- Rename `-client` to `-real-client` (or `-http-client`) and `-mock-client` stays; make the public pair symmetric: `mock-client`/`real-client`, `mock-client-full-response`/`real-client-full-response`.
- Fix `client`'s docstring: replace the `http://localhost:3000` examples with endpoint-only examples, and say "runs the ring handler in-process inside a `future`, which conveys dynamic bindings (so `with-dynamic-fn-redefs` reaches the handler)".
- Add one line to the `with-dynamic-fn-redefs` docstring: "`mt/user-http-request` / `mt/client` convey bindings; `mt/user-real-request` / `client-real-response` do not."
- Optionally a kondo hook: an ignore of `:metabase/prefer-with-dynamic-fn-redefs` whose body only calls `mt/user-http-request`/`mt/client` (no real-client call) is flagged.

## Detection signal
- A new `#_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}` whose comment mentions "Jetty"/"real HTTP" in a form that has no `real-client`/`client-real-response`/`user-real-request*` call.
- Transcript: agent greps `build-url` or `localhost` in http_client.clj and then asserts "real HTTP" without reading `client`/`client-full-response`.
- Parallel agents reaching contradictory conclusions about the same helper is itself a strong papercut signal.

## Raw excerpts
```
L629 [ASSISTANT] The evidence is now decisive. `user-http-request` is `(partial user-request client/client)` — the mock client — and its own docstring says "this makes a mock API call, not an actual HTTP call, use `user-real-request` for that." The mock path runs `@(future (-mock-client parsed))`, which invokes the ring handler in-process, and `future` conveys dynamic bindings. There is a separate `user-real-request` built on `real-client` that none of the suppressed tests use.

So **batch A was right and batch B was wrong**. B appears to have misread `build-url`'s `http://localhost:<port>` string — which only the real client uses — as proof of a real HTTP call. Its 7 suppressions rest on a false premise, and their why-comments assert something untrue.
```
```
L730 [ASSISTANT] Important catch: `saml_test:619` calls `client/client-real-response`, which routes to `-client` — the **real** HTTP path (the naming is treacherous: `client-full-response` is mock, `client-real-response` is real). So the SSO suppressions are correct, and my earlier per-file greps used patterns (`real-client`, `user-real-request`) that would **miss** `client-real-response` entirely.
```
```
(subagent D) L439 [ASSISTANT] ... My "real HTTP / Jetty worker thread" premise came from `build-url` producing a `http://localhost:<port>` string — I never traced which client actually consumes it.
```
Current `client` docstring (http_client.clj ~509):
```
  "Perform a mock API call and return the response body (for test puposes).
  To make an actual http call use [[real-client]].
  ...
    (client :get 200 \"card/1\")                ; GET  http://localhost:3000/api/card/1, throw exception if status code != 200
  ...
  Note: One benefit of [[client]] over [[real-client]] is the call site and API execution are on the same thread,
  so it's possible to run a test inside a transaction and bindings will work."
```
