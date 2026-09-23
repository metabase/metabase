---
title: Recreating a test Postgres container hung for the full 300 s tool timeout because `docker pull` blocked in the macOS keychain credential helper; only a raw Engine API pull through the socket worked
slug: docker-credential-helper-hangs-pull
kind: env-friction
impact: wasted-time
severity: medium
status: open
area: Docker CLI on OrbStack (credential helper), `docker run` of an image not present locally; local uploads Postgres container for Slackbot testing
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/96d0c640-59ab-460e-a02f-22ef7f27d71e.jsonl
    lines: 189-256
    date: 2026-09-14
    jev: {any_papercut: 0.87, env_toolchain: 0.90, stale_state: 0.24, verify_mismatch: 0.17, misleading_code: 0.23, hidden_coupling: 0.43, stale_docs: 0.26, tool_footgun: 0.83, flaky: 0.74, agent_bug: 0.27, wasted_effort: 0.67, user_correction: 0.08}
---
## Summary
Replicating a Slackbot upload PR needed the uploads Postgres container, which had been removed. `docker run ... postgres:17-alpine` had to pull the image and hung until the Bash tool's 300-second timeout moved it to the background with no output. A timed `docker pull` showed `error getting credentials - err: signal: terminated`: the CLI's credential helper never returned in the agent's non-interactive session, and an empty DOCKER_CONFIG did not help. Another session's `docker run --rm node:22-alpine ...` had been running for nine minutes, likely stuck the same way. Pulling through the Engine API with `curl --unix-socket ... /images/create` worked in seconds.

## Symptom
L205: "Command did not complete within its 300s timeout and was moved to the background". L218: an unrelated `docker run --rm node:22-alpine` from another session had been running 08:58. L223 and L242: `error getting credentials - err: signal: terminated, out: ``` for `docker pull`, with and without a throwaway DOCKER_CONFIG.

## Timeline
- L189-L195: container missing; database config shows it expected on port 5433.
- L199-L205: `docker run` blocks for 300 s, auto-backgrounded.
- L212-L218: diagnosis; OrbStack running, registry reachable, another session's docker run stuck.
- L222-L223: `timeout 25 docker pull` shows the credential helper error.
- L228-L242: empty DOCKER_CONFIG plus explicit DOCKER_HOST, same error.
- L250-L256: pull via the Engine API socket, then `docker run` succeeds.
- Cost: about 10 minutes of wall time including the 300 s timeout, before the replication could start.

## Root cause
For an image not present locally the Docker CLI asks its credential helper for registry credentials even for a public image; on this Mac the helper (keychain-backed by default when present) did not return in the agent's non-interactive session and was killed. Why it hangs (locked keychain, a hidden prompt) is unknown. The Engine API pull path does not invoke the CLI's credential helper.

## Why agents fall for it
`docker run image` is the standard one-liner and pulls implicitly; the hang produces no output, so it looks like a slow download until the tool timeout.

## Current state
Not checked (local machine state).

## Suggested fix
- Keep the test Postgres image pre-pulled and have the local setup script check it (`docker image inspect postgres:17-alpine`) before `docker run`.
- In agent guidance: pull with a short `timeout`; on `error getting credentials`, use the Engine API pull (`curl --unix-socket ~/.orbstack/run/docker.sock -X POST "http://localhost/images/create?fromImage=postgres&tag=17-alpine"`).
- Or configure the CLI with no credential store for public pulls in agent sessions.

## Detection signal
`error getting credentials - err: signal: terminated`; a `docker run` or `docker pull` hitting the Bash tool timeout; long-running `docker run` processes from other sessions in `pgrep`.

## Raw excerpts
```
L190 [RESULT] Error response from daemon: No such container: mb-upload-pg | failed to start containers: mb-upload-pg | 62
L199 [CALL] Bash: docker run -d --name mb-upload-pg -e POSTGRES_USER=metabase -e POSTGRES_PASSWORD=<redacted> -e POSTGRES_DB=uploads -p 5433:5432 postgres:17-alpine 2>&1 | tail -2; for i in $(seq 1 30); do docker exec mb-upload-pg pg_isready -U metabase -d uploads >/dev/null 2>&1 && break; sleep 2; done; ...
L205 [RESULT] Command did not complete within its 300s timeout and was moved to the background (ID: b6ln6i619). Output is being written to: <tasks>/b6ln6i619.output.
L217 [CALL] Bash: orb status 2>&1 | head -3; curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' --max-time 10 https://registry-1.docker.io/v2/; ps -o pid,etime,command -p 56397 2>/dev/null | tail -1 | cut -c1-120
L218 [RESULT] Running | 401 0.286045s | 56397 08:58 docker run --rm node:22-alpine node -e console.log(process.version, typeof navigator.locks)
L222 [CALL] Bash: (timeout 25 docker pull postgres:17-alpine 2>&1 | tail -5) ; echo "exit=$?"; ...
L223 [RESULT (ERROR)] Exit code 1 | error getting credentials - err: signal: terminated, out: `` | exit=0
L228 [CALL] Bash: pkill -f "docker run -d --name mb-upload-pg" ; sleep 1; S=<scratchpad>; mkdir -p $S/dockercfg; echo '{}' > $S/dockercfg/config.json; ... export DOCKER_CONFIG=$S/dockercfg DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock; timeout 240 docker pull -q postgres:17-alpine 2>&1 | tail -2; ...
L242 [RESULT] srwxr-xr-x@ 1 <user> staff 0 Sep 14 16:22 ~/.orbstack/run/docker.s | error getting credentials - err: signal: terminated, out: ``
L250 [CALL] Bash: SOCK=$HOME/.orbstack/run/docker.sock; timeout 240 curl -s --unix-socket $SOCK -X POST "http://localhost/images/create?fromImage=postgres&tag=17-alpine" | tail -c 300; ...
L252 [RESULT] ... {"status":"Status: Downloaded newer image for postgres:17-alpine"} | | ['postgres:17-alpine']
L256 [RESULT] 90c0dda75dbb... | /var/run/postgresql:5432 - accepting connections | [value] true
```
