# instance-stats-snowplow

Source: `e2e/test/scenarios/stats/instance-stats-snowplow.cy.spec.js` (33 lines, 2 tests)
Target: `tests/instance-stats-snowplow.spec.ts` — **2 `test.fixme`, 0 executed**

## The generalisable finding: snowplow events split into two classes, and only one is capturable

Every snowplow-subject spike port so far (`search-snowplow`,
`visualizer-snowplow-tracking`, `data-studio-metrics`, `reference-databases`,
`security-center-snowplow`) asserts an event the **frontend** emits, so
`installSnowplowCapture` records the tracker POST at the browser boundary.
PORTING now reads as if that technique is the default for "snowplow-subject
specs" generally. It is not — it covers exactly the FE-emitted class.

`instance_stats` is **backend-emitted**:

- `src/metabase/analytics/stats.clj:1054` —
  `(analytics.event/track-event! :snowplow/instance_stats snowplow-data)`
- `src/metabase/analytics/snowplow.clj` — `track-event!` calls `.track` on a
  Java `Tracker`, which POSTs via Apache HttpClient to
  `(analytics.settings/snowplow-url)`.
- `POST /api/testing/stats` (`src/metabase/testing_api/api.clj:231` →
  `phone-home-stats!`) is what the spec triggers.

The POST leaves the JVM. It never passes through the browser, so `page.route`
cannot see it and `installSnowplowCapture` captures nothing.

**Measured, not inferred** (2026-07-20, slot 4105, jar `751c2a98`): a plain
`node:http` server bound on the collector port received, ~1s after
`POST /api/testing/stats` returned 200, one
`POST /com.snowplowanalytics.snowplow/tp2` whose base64url `ue_px` decodes to
`iglu:com.metabase/instance_stats/jsonschema/2-0-0` (plus an `OPTIONS` on the
same path). The browser issued no such request. **The app is fine — the event
fires with the right schema. We have no seam to observe it from.**

Before writing a similar port, ask which side emits the event. `track-event!`
call sites in `src/`/`enterprise/backend/src/` are the unportable class;
`trackSchemaEvent`/`trackSimpleEvent` call sites in `frontend/` are the
capturable one.

## Why re-pointing the collector from a test does not work

`snowplow.clj` builds the tracker in a `defonce`, and `network-config` reads
`snowplow-url` at that moment:

```clojure
(defonce ^:private tracker
  (Snowplow/createTracker ^TrackerConfiguration (tracker-config)
                          ^NetworkConfiguration (network-config)   ; reads snowplow-url
                          ^EmitterConfiguration (emitter-config)))
```

So the collector URL is **fixed at backend boot**. Writing the `snowplow-url`
setting through the API at test time has no effect on where events go — the
"stand up a local collector and re-point the client" trick that makes
`installSnowplowCapture` work on the FE is simply unavailable on the BE.

## What would fix it (follow-up, needs a shared-module change)

Boot each slot backend with `MB_SNOWPLOW_URL=http://localhost:<per-slot
collector port>` in `support/worker-backend.ts` (which already sets
`MB_SITE_URL`, `MB_DB_FILE`, …), and have the spec bind that port and assert on
the received payload. Per-slot ports keep the isolation property that made us
reject snowplow-micro. Not done here: `worker-backend.ts` is a shared support
module this port is not allowed to edit.

Doing it from inside the spec without the harness change was rejected
deliberately: the collector port is global and five slots share the box, and on
a clean backend (and in CI) `snowplow-url` is not a localhost URL at all — the
jar's default is `https://sp.metabase.com`. A spec that skips whenever the env
var happens to be absent is the FINDINGS #49 "green run that never executed"
shape.

## Slot-environment observation (relevant to the above, and to the brief's warning)

Slot 4105's backend process carries leaked
`MB_SNOWPLOW_URL=http://localhost:9090` / `MB_SNOWPLOW_AVAILABLE=true` (also as
`-Dmb.snowplow.url` / `-Dmb.snowplow.available`) from an earlier session. Nothing
was listening on :9090.

Two consequences worth recording:

1. The brief's qualifier holds — the leak is a **non-issue for
   `installSnowplowCapture`**; `security-center-snowplow` ran green on this
   exact slot. Re-confirmed.
2. It is **not** a non-issue for backend-emitted events, and it cuts the
   *safe* way here. Without that leak the jar's `snowplow-url` default is
   `https://sp.metabase.com` and `snowplow-available` defaults to
   `config/is-prod?` = **true**, so on a clean jar slot `POST /api/testing/stats`
   would fire a real `instance_stats` event at Metabase's **production
   collector**. PORTING already flags this for the FE case; it applies to any
   port that calls `/api/testing/stats`, and there is no client-side override to
   save you. Another reason not to un-fixme these tests without the harness
   change.

## Scope of what was NOT verified

The Cypress original was not run. The only fact in dispute — where the event
goes — was settled directly by the collector probe, and no claim is made here
about product behaviour. Upstream passes because snowplow-micro is exactly such
an external collector at the boot-fixed `http://localhost:9090`, polled over
HTTP via `/micro/good`; nothing about the Cypress spec is beyond Playwright's
reach, it just depends on a container at a URL the backend was booted against.

## Smaller port notes

- Upstream's first test is `@OSS`-tagged (would gate-skip on the spike's EE jar
  via `isOssBackend`); the second is untagged. The two bodies are byte-identical.
- The assertion is `H.expectSnowplowEvent({ event: { event_name: "instance_stats" } })`,
  **not** `expectUnstructuredSnowplowEvent`. It matches micro's *enriched*
  record, so any collector-side port must assert on the derived `event_name`
  (or the `iglu:com.metabase/instance_stats/...` schema URI in the raw payload),
  not on `data.data`.

---

## RESOLVED (2026-07-20) — see findings-inbox/per-slot-snowplow-collector.md

Both tests now run and pass. Each slot backend is booted pointing at its own
in-process `node:http` collector (`support/snowplow-collector.ts`), so
backend-emitted events are observable without snowplow-micro's shared store.

**One claim above needs correcting.** The proposed fix — "boot each slot backend
with `MB_SNOWPLOW_URL=…` in `support/worker-backend.ts`" — does not work.
Settings resolve through `environ`, which merges system properties *after*
environment variables, and `deps.edn`'s `:e2e` alias already sets
`-Dmb.snowplow.url=http://localhost:9090` (applied via `JDK_JAVA_OPTIONS` by
`e2e/runner/cypress-runner-backend.js`, in both jar and source mode). Measured:
booting with `MB_SNOWPLOW_URL=http://localhost:5999` left the setting reporting
`http://localhost:9090`. `_JAVA_OPTIONS` is used instead — the JVM applies it
after the command line, so it beats the alias.

Two other claims above are also corrected there: `config/is-prod?` is **false**
for slot backends (the same alias sets `-Dmb.run.mode=e2e`), so the jar's
`snowplow-url` default was never `https://sp.metabase.com` here; and the
"leaked" `MB_SNOWPLOW_URL`/`MB_SNOWPLOW_AVAILABLE` process env is not leakage —
`support/env.ts` loads them from repo-root `cypress.env.json` on every run.
