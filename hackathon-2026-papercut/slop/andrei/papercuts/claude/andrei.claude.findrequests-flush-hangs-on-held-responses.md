---
title: The jest helper `findRequests` awaits `fetchMock.callHistory.flush()`, which waits for every in-flight response, so a spec that deliberately holds a PUT pending hangs to jest's 30 s timeout; and overriding the settings PUT mock needs the helper's exact route name `update-setting`, otherwise the helper's earlier route keeps answering silently.
slug: findrequests-flush-hangs-on-held-responses
kind: test-harness
impact: wasted-time
severity: low
status: open
area: frontend/test/__support__/server-mocks/util.ts (findRequests), frontend/test/__support__/server-mocks/settings.ts (setupUpdateSettingEndpoint), fetch-mock removeRoute
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/21ad940c-c551-4b95-84ed-c73a3ac86c8a.jsonl
    lines: 947-1002
    date: 2026-08-24
    jev: {any_papercut: 0.88, env_toolchain: 0.87, stale_state: 0.36, verify_mismatch: 0.48, misleading_code: 0.68, hidden_coupling: 0.83, stale_docs: 0.43, tool_footgun: 0.72, flaky: 0.64, agent_bug: 0.93, wasted_effort: 0.39, user_correction: 0.09}
---
## Summary
The agent wrote two `AdminSettingInput` specs that hold a settings PUT open to test write ordering. First the held route never received calls, because `fetchMock.removeRoute("put-setting")` removed nothing and the helper's regex route (named `update-setting`) matched first. After fixing the name, the sibling-refetch spec hung in `findRequests`, whose flush waits for the held PUT, and it plus four later specs in the file failed at about 30 s each. The agent switched to `fetchMock.callHistory.calls("update-setting")`.

## Symptom
- L953-963: `expect(pendingXrayPuts).toHaveLength(1)` failed with `Expected length: 1, Received length: 0`.
- L986: route-name mismatch; the real name is `update-setting` and the earlier-registered regex wins.
- L988-990: after the rename, `should persist a reversal after a sibling setting's refetch lands mid-save (31078 ms)` and four later specs at about 30 000 ms each; `Tests: 5 failed, 21 passed, 26 total`.
- L993: `findRequests` flushes all pending calls, including the held PUT, so it hangs.

## Timeline
- L947 (13:36:45): adds the race specs with a held-response route.
- L952-963: run fails; the held route saw no calls.
- L975-986: reads `setupUpdateSettingEndpoint`, finds the route name.
- L988-990 (13:40:34): rerun; one spec hangs to the timeout and four more fail after it.
- L993-1002 (13:41:02): replaces `findRequests` with non-flushing call history; 26 passed.
- Cost: 4 jest runs and about 4.5 minutes.

## Root cause
`findRequests` begins with `await fetchMock.callHistory.flush();`, which resolves only after all pending responses settle. `setupUpdateSettingEndpoint` registers `fetchMock.put(new RegExp("/api/setting/"), { status }, { name: "update-setting" })`; fetch-mock matches routes in registration order and `removeRoute` with a name that does not exist is a no-op.

## Why agents fall for it
The name reads like a pure lookup of recorded calls; the flush is an implementation detail. Registering a second route for the same URL looks like an override but silently loses to the first one.

## Current state
Checked origin/master: `findRequests` in util.ts still calls `flush()` first; `setupUpdateSettingEndpoint` still names its route `update-setting`.

## Suggested fix
- Give `findRequests` a `{ flush: false }` option, or add a non-flushing `getRequests`, and say in its docstring that it waits for in-flight responses.
- Export the route name as a constant, or wrap `removeRoute` in test support so an unknown name throws.

## Detection signal
Jest specs that hold a promise-returning fetch-mock response and also call `findRequests`, timing out at the default 30 s; or `Received length: 0` right after a `fetchMock.put` override for `/api/setting`.

## Raw excerpts
```
L947 [CALL] Bash: python3 - <<'PY' [...] const pendingPuts: Array<() => void> = []; fetchMock.removeRoute("put-setting"); fetchMock.put("express:/api/setting/:key", () => new Promise<void>((resolve) => pendingPuts.push(resolve)).then(() => ({ status: 204 })), { name: "put-setting" }); [...]
L958 [RESULT] ✕ should hold a change made during a save and send it after, in order (1051 ms)
L963 [RESULT] ● AdminSettingInput › should hold a change made during a save and send it after, in order  expect(received).toHaveLength(expected)  Expected length: 1  Received length: 0
L990 [RESULT] Tests:       5 failed, 21 passed, 26 total
L994 [CALL] Bash: [...] await waitFor(() => { expect(fetchMock.callHistory.calls("update-setting")).toHaveLength(1); }); [...]
L1002 [RESULT] ok Tests:       26 passed, 26 total
```
