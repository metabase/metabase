# embedding-admin-settings-starter — port findings

Slot 5 (:4105), jar mode. Backend verified: `version.hash = 751c2a9` vs
`target/uberjar/COMMIT-ID = 751c2a98`, real `java -jar` process.

Source: `e2e/test/scenarios/embedding/embedding-admin-settings-starter.cy.spec.ts`
(57 lines, 3 tests) → `tests/embedding-admin-settings-starter.spec.ts`.

## Numbers

- **3 executed, 0 gate-skipped, 0 fixme.**
- **3/3 green**; **6/6 under `--repeat-each=2`**.
- `bunx tsc --noEmit` clean.
- No support-module changes; no companion support module.

## Is the tier gate real? YES — mutation-confirmed

Upstream carries no tag and activates `starter`. Probed across tiers:

| tier              | `Setup guide` link | `Guest embeds` link |
| ----------------- | ------------------ | ------------------- |
| no token          | absent (0)         | absent (0)          |
| `starter`         | absent (0)         | absent (0)          |
| `pro-self-hosted` | **present (1)**    | **present (1)**     |

**Mutation: swap `activateToken("starter")` → `activateToken("pro-self-hosted")`
and the first test fails** (`toHaveCount(0)`, `Received: 1`). So `starter`
genuinely lacks the feature that mounts those links and the absence checks are
non-vacuous by inversion.

The token is **asserted to have taken** (beforeEach probes
`/api/session/properties` for a non-empty enabled-feature set) rather than
trusted — `activateToken` PUTs with `failOnStatusCode: false`, so "it did not
throw" proves nothing.

## Why this file has no `fixme` and its OSS twin does

The two upstream files are near-identical copy-paste twins, and the duplication
is kept as the faithful state (two upstream specs, two tier setups — not folded
into a shared loop).

The **only** substantive difference is the upsell test: the OSS file also
asserts the "Upgrade" CTA's `href`, which is OSS-BUILD-only rendering and had to
be `fixme`'d (full `UpsellCta` branch analysis in
`findings-inbox/embedding-admin-settings-oss.md`). This file's upsell test
asserts only the heading and the gem icon — neither build-dependent — so it
ports and runs cleanly. A good illustration that "the same test in the OSS and
starter files" can have very different portability.

Upstream's title here still reads `"should show embedding upsell on oss"` on the
*starter* spec (copy-paste). Kept verbatim rather than corrected, to preserve
title-based selection parity with upstream.

## Rule 3 on `cy.icon("gem")`

Two gems render inside `admin-layout-content` on this jar (embedding upsell +
the EE-build `dev_instances` upsell). Upstream's `.should("be.visible")` on a
multi-element subject is an ANY-of-set assertion (chai-jquery `visible` is
`$el.is(":visible")`; jQuery `.is()` is true if at least one matches), so
`.filter({ visible: true }).first()` is the faithful port — not a defensive
`.first()`.
