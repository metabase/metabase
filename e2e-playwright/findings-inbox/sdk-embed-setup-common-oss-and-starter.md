# sdk-embed-setup-common-oss-and-starter — port findings

Slot 5 (:4105), jar mode. Backend verified: `version.hash = 751c2a9` vs
`target/uberjar/COMMIT-ID = 751c2a98`, real `java -jar` process.

Source:
`e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/common-oss-and-starter.cy.spec.ts`
(48 lines, 2 tests × 2 tiers = 4) →
`tests/sdk-embed-setup-common-oss-and-starter.spec.ts`.

## Provenance: inherited partial, verified and kept unchanged

Already on disk from a cancelled previous agent, state UNKNOWN. Read against the
Cypress original, judged faithful, and **verified rather than trusted**: 4/4
green, 8/8 under `--repeat-each=2`, and its central tier claim independently
mutation-tested (below) rather than taken from its header comment.
**Kept as-is — no edits.**

## Numbers

- **4 executed, 0 gate-skipped, 0 fixme.**
- **4/4 green**; **8/8 under `--repeat-each=2`**.
- `bunx tsc --noEmit` clean.
- No support-module changes; no companion support module.

## Is the tier gate real? YES — mutation-confirmed

This is the `-oss-and-starter` half of the pair whose `-ee` half is the landed
`tests/sdk-embed-setup-common-ee.spec.ts`. An **assertion gate**, not a describe
gate: the only mechanical difference between the two describes is
`activateToken("starter")`.

Measured token-features (independently reconfirmed this session):

| tier           | enabled token-features                                             |
| -------------- | ------------------------------------------------------------------ |
| no token (OSS) | (none)                                                             |
| `starter`      | config_text_file, hosting, offer-metabase-ai-managed, support-users |

Neither contains `embedding_simple`.

**Mutation: add `activateToken("pro-self-hosted")` to the second test and it
fails** — SSO radio `Expected: disabled, Received: enabled`. So the gate is real
and the assertion is the exact inverse of `common-ee`'s "allows to select the
`Metabase Account` item…", which asserts **enabled** on the same setup.
Skipping either by reflex would delete the only assertion distinguishing the
two files.

The OSS precondition is **asserted, not assumed**: the beforeEach probes
`/api/session/properties` and requires the enabled set to be exactly empty. It
is — a useful measured data point in its own right: on this EE jar,
`mb.restore()` with no token leaves **zero** enabled token features, so the
token half of `@OSS` is faithfully reproduced even though the build half is not.

## Port notes worth keeping

- The `cy.intercept("GET", "/api/dashboard/**").as("dashboard")` in the
  beforeEach is **never awaited** by either test — both pass
  `waitForResource: false`, which is precisely the "don't wait for the dashboard"
  switch. Dropped per rule 2; arming a `waitForResponse` nobody awaits would
  reject unhandled.
- Snowplow is not the subject (no event assertions, no
  `expectNoBadSnowplowEvents`). `H.enableTracking()` is ported as the
  `anon-tracking-enabled` setting so backend state matches upstream, and
  `installSnowplowCapture` is installed **only** to stop that firing real
  analytics at the production collector on a clean jar boot. Nothing asserts on
  it.
- `H.mockEmbedJsToDevServer()` dropped, per the `sdk-embed-setup.ts` header.
