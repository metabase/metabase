# Per-slot Snowplow collector

Gives every slot backend its own in-process collector, so **backend-emitted**
snowplow events become observable without reintroducing snowplow-micro's shared
global store. Un-`test.fixme`s the two `instance-stats-snowplow` tests, and
recovers real Iglu schema validation as a side effect.

Files: `support/snowplow-collector.ts` (new), `support/iglu-validate.ts` (new),
`support/worker-backend.ts`, `support/fixtures.ts`,
`tests/instance-stats-snowplow.spec.ts`.

## The design

Snowplow events split into two classes with two different observation seams:

| | emitted by | seam |
|---|---|---|
| FE events (`trackSchemaEvent`) | browser tracker | `page.route` on `…/tp2` — `installSnowplowCapture`, **unchanged** |
| BE events (`snowplow.clj track-event!`) | Java `Tracker` → Apache HttpClient | a real collector |

Cypress sees both because snowplow-micro is a real collector. We rejected micro
for the ports because it has ONE global event store on ONE fixed port (:9090)
that `resetSnowplow` wipes — five parallel slots would trample each other.

The fix keeps micro's vantage point without micro's shared state: a `node:http`
server per slot, port = backend port + 1000 (4101 → 5101), started by
`startWorkerBackend` **before** the backend is spawned (so boot-time events like
`account`/`new_instance_created` aren't missed) and stopped in the worker
fixture's teardown. The two mechanisms coexist: `installSnowplowCapture`
overrides `snowplow-url` *client-side*, so FE events keep being caught in-page.

`SnowplowCollector.record()` produces the same decoded `data.data` shape
`SnowplowCapture` produces, so assertions read the same on either side, plus the
Iglu schema URI — needed because upstream's `H.expectSnowplowEvent({ event: {
event_name } })` matches micro's *enriched* record, and `event_name` is
something micro derives from the schema URI. Raw collector payloads have no such
field; `eventNameOf` derives it the same way.

## The brief's approach did not work, and the reason is the interesting part

The plan was `MB_SNOWPLOW_URL` in the `spawn` env block, on the `MB_SITE_URL`
precedent ("env beats the app DB, so it survives `restore()`"). That reasoning
is sound for the app DB and irrelevant here, because the competing value is not
in the app DB.

Metabase settings resolve through `environ`, whose map is built as:

```clojure
(merge-env (read-env-file ".lein-env") (read-env-file ".boot-env")
           (read-system-env) (read-system-props))
```

`read-system-props` is **last**, so JVM system properties beat environment
variables. And `deps.edn`'s `:e2e` alias already contains:

```
"-Dmb.snowplow.available=true"
"-Dmb.snowplow.url=http://localhost:9090"
```

which `e2e/runner/cypress-runner-backend.js` applies via `JDK_JAVA_OPTIONS` in
**both** jar and source mode — and it *overwrites* `JDK_JAVA_OPTIONS`
unconditionally, so we cannot append there either.

**Measured** (slot 4101, jar `751c2a98`, 2026-07-20):

| boot env | reported `snowplow-url` |
|---|---|
| `MB_SNOWPLOW_URL=http://localhost:5999` | `http://localhost:9090` — **ignored** |
| `_JAVA_OPTIONS="-Dmb.snowplow.url=http://localhost:5101 …"` | `http://localhost:5101` — **wins** |

`_JAVA_OPTIONS` is the one channel the JVM applies *after* the command line, so
it beats the alias. The live slot backend now shows all three layers at once —
`MB_SNOWPLOW_URL=…:9090` in its env, `-Dmb.snowplow.url=…:9090` in
`JDK_JAVA_OPTIONS`, `-Dmb.snowplow.url=…:5101` in `_JAVA_OPTIONS` — and reports
`5101`. That is the precedence chain proven end to end, not inferred.

End-to-end proof before any harness code was written: a bare `node:http` server
on 5101 received, after `POST /api/testing/stats`, one `tp2` POST decoding to
`iglu:com.metabase/instance_stats/jsonschema/2-0-0`.

## Correction to the brief's production-collector safety claim

The brief said a jar-mode backend has `snowplow-url` defaulting to
`https://sp.metabase.com` (`analytics/settings.clj:67`, since `config/is-prod?`
is true for the uberjar), so specs that neither stub nor capture snowplow fire
real events at Metabase's production collector.

**That does not hold for slot backends, and the reason matters.** The `:e2e`
alias also sets `-Dmb.run.mode=e2e`, so `config/is-prod?` is **false**, and the
same alias pins `snowplow-url` to `http://localhost:9090` anyway. Measured: a
slot backend booted from a clean shell (no snowplow env at all) reported
`snowplow-url: http://localhost:9090`, not `sp.metabase.com`. Nothing was
escaping to production. The premise was reasonable from reading
`settings.clj` alone; the alias is what falsifies it.

Relatedly, the brief's "leaked `MB_SNOWPLOW_URL`/`MB_SNOWPLOW_AVAILABLE` process
env from an earlier session" is not leakage: `support/env.ts` deliberately loads
repo-root `cypress.env.json`, which contains exactly those two keys. It is
loaded on every run, by design.

**So the honest safety statement is narrower than the brief's, and still worth
making.** Before this change every slot backend emitted to the single fixed port
:9090 — meaning (a) if snowplow-micro happened to be up, all five slots'
backend events interleaved into one store that any slot's `resetSnowplow` could
wipe, and (b) if it was not up, backend events vanished with no signal. After
this change each slot's backend emits only to a collector this process owns and
tears down. The `sp.metabase.com` exposure is real only for a backend booted
*without* the `:e2e` alias, which the harness never does — but the
`_JAVA_OPTIONS` pin now forecloses even that, for every slot, whether or not the
spec cares about snowplow.

## Reuse guard

`snowplow-url` is fixed at backend boot — `snowplow.clj` builds its `Tracker` in
a `defonce` whose `network-config` reads the setting once — so a backend booted
without this wiring can never be re-pointed. `startWorkerBackend`'s reuse path
now probes `/api/session/properties` and only reuses a backend whose
`snowplow-url` is this slot's collector; otherwise it kills the port and boots a
fresh one. Without that, a stale slot backend would make every backend-event
assertion silently unobservable — the #49 shape.

## Iglu validation: attempted, and it works

`expectNoBadSnowplowEvents` has been a structural check since `search-snowplow`
because we had no Iglu validator. A real collector is the seam where that can be
recovered, and it was: `support/iglu-validate.ts` compiles the schemas vendored
at `snowplow/iglu-client-embedded/schemas/<vendor>/<name>/jsonschema/<version>`
with `ajv` (stripping the `$schema` metaschema pointer and the `self` coordinate
block, neither of which is a constraint) and validates each decoded body.

Verified rather than assumed, both standalone and **inside a Playwright worker**
(where module resolution differs):

- valid `instance_stats` payload → `available: true`, 0 failures
- same payload with `analytics_uuid: 12345` → 1 failure, `must be string`
- unknown schema URI → 1 failure, `no such schema in iglu-client-embedded`
  (reported, not skipped — micro would reject it too)
- injecting a schema-invalid event into the spec made the real run **fail** with
  `Iglu schema validation failed for 1 captured event(s)`

Two stated limits: **unstruct event bodies only** (micro also validates attached
contexts, which arrive separately base64-encoded and are not decoded), and
`ajv` is **not a declared dependency** of `e2e-playwright` — it resolves by
walking up to the repo root's `node_modules`, which CI has (the job runs
`bun run build-pure:cljs` before the Playwright steps). If it ever stops
resolving, `validateIgluPayloads` returns `available: false`, the caller warns
loudly and degrades to the structural check rather than passing silently.

**Not done:** retrofitting this onto `search-snowplow.ts`'s browser-side
`expectNoBadSnowplowEvents`. It is now a small change (the validator is
generic), but it would alter the assertion strength of ~26 landed tests across
five specs, which is a separate change with its own verification burden.

## Re-verification

Jar mode (`JAR_PATH=…/target/uberjar/metabase.jar`), `PW_PER_WORKER_BACKEND=1`,
`PW_SLOT_OFFSET=1`, `--workers=1`, slot backend killed and rebooted first so the
wiring was under test rather than a pre-existing backend.

| run | result |
|---|---|
| `instance-stats-snowplow` | 1 passed, 1 skipped (OSS-gated on an EE jar) |
| mutation: trigger call removed | **1 failed** — `Timeout 60000ms exceeded while waiting on the predicate` |
| full set, `--repeat-each=2`, Iglu active | **130 passed, 2 skipped, 0 failed** (3.7m) |

Full set = `instance-stats-snowplow`, `search-snowplow`,
`visualizer-snowplow-tracking`, `data-studio-metrics`,
`security-center-snowplow`, `homepage`. `search-snowplow`'s 60-odd
browser-boundary tests pass unchanged, which is the coexistence property.
`homepage` covers the "ordinary backend not disturbed" case.

`bunx tsc --noEmit`: clean.

### One failure investigated and attributed to the environment, not the change

An earlier `--repeat-each=2` run failed with
`worker process exited unexpectedly (code=null, signal=SIGKILL)`. Checked before
concluding anything: the box was at 1.78G/3G swap, and the **two unrelated slot
backends on :4102 and :4105 had also been killed** — nothing in this change
touches those ports. Machine-level memory pressure. Re-running with the box
freed gave 130/130. An earlier single failure in `data-studio-metrics`' caching
test also did not reproduce, in isolation or across two subsequent full runs;
the same multi-spec set at baseline (change stashed) passed it, so it is
recorded as an unattributed flake rather than assigned a mechanism.

## CI notes

- **No container needed** — the collector is a `node:http` server in the
  Playwright process, started and stopped by the worker fixture. This holds
  because CI always sets `PW_PER_WORKER_BACKEND=1`
  (`.github/workflows/e2e-playwright.yml:136`), which is the only path that
  boots a backend we control the JVM flags for.
- **Ports**: CI runs `--workers=2 --fully-parallel` per shard, so slots 0–1 →
  collectors 5100–5101. GitHub runners have those free; the block collides with
  nothing in `docker-compose.yml`.
- **Teardown on worker crash**: the collector dies with the node process and the
  OS releases the port, so a replacement worker can bind. The collector is
  deliberately *not* kept alive across workers the way backends are — it cannot
  be inherited by a different process.
- **Backend outliving its collector** (`PW_KEEP_SLOT_BACKENDS=1` locally): the
  JVM keeps POSTing to a closed port and gets connection-refused, which
  `track-event!` swallows in its `catch Throwable`. Harmless; the reuse guard
  handles the next run.
- **snowplow-micro on :9090 is now irrelevant to the Playwright harness.** It is
  still needed for running the original Cypress specs.

## Supersedes

`findings-inbox/instance-stats-snowplow.md` — its diagnosis was right and its
proposed fix was right in shape, but `MB_SNOWPLOW_URL` specifically does not
work, for the precedence reason above.
