# embedding-admin-settings-oss — port findings

Slot 5 (:4105), jar mode. Backend verified before trusting the green:
`version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID = 751c2a98`, process is
`java -jar target/uberjar/metabase.jar`.

Source: `e2e/test/scenarios/embedding/embedding-admin-settings-oss.cy.spec.ts`
(66 lines, 3 tests) → `tests/embedding-admin-settings-oss.spec.ts`.

## Numbers

- **2 executed, 0 gate-skipped by tier, 1 `fixme`** (see below — the fixme is a
  BUILD gate, not a token gate).
- **2/2 green**; **4/4 under `--repeat-each=2`**.
- `bunx tsc --noEmit` clean.
- No support-module changes; no companion support module.

## Headline: an assertion that is unportable to an EE jar, with the mechanism nailed

This is the cleanest instance of FINDINGS #49 ("an EE jar with no token is NOT
an OSS build") found so far, and unlike previous instances the exact code path
is identified rather than inferred.

`should show embedding upsell on oss` asserts:

```js
cy.findByRole("link", { name: "Upgrade" })
  .should("have.attr", "href")
  .and("eq", "https://www.metabase.com/upgrade?…&source_plan=oss&…");
```

On this jar there is **no such link**. Measured: `role=link name="Upgrade"`
count **0**, `role=button name="Upgrade"` count **1**, `tagName=BUTTON`,
`href=null` — at *every* tier (no token, `starter`, `pro-self-hosted`).

Mechanism, read from source and confirmed against the running jar:

- `SharedCombinedEmbeddingSettings.tsx` renders
  `<UpsellBanner buttonText="Upgrade" buttonLink={upgradeUrl}
   onClick={triggerUpsellFlow}>`.
- `UpsellCta.tsx` is a `ts-pattern` match that tests **`onClick` before `url`**:
  the first arm is `{ onClick: P.nonNullable }` → `<UnstyledButton>` (no href);
  only the second arm `{ url: P.nonNullable }` → `<ExternalLink href={url}>`.
- `triggerUpsellFlow` comes from `PLUGIN_ADMIN_SETTINGS.useUpsellFlow`. The OSS
  default (`frontend/src/metabase/plugins/oss/settings.ts`) returns
  `{ triggerUpsellFlow: undefined }`; `metabase-enterprise/license/index.ts`
  overwrites it with the real hook.

So the branch is chosen by **plugin registration** (`PLUGIN_IS_EE_BUILD`), not
by token features. **No token manipulation can reproduce it.** This is a build
gate with no runtime lever.

Handled as `test.fixme` with the full analysis inline, rather than dropped or
weakened: deleting the href assertion would leave a green test that no longer
checks the upsell URL, which is the only thing the test is about. An OSS-build
CI lane can flip the `fixme` and run it unchanged.

**Generalises:** any spec asserting `findByRole("link", …)` on an `UpsellBanner`
/ `UpsellCta` CTA is OSS-build-only on that assertion. On an EE build the same
CTA is a `<button>`. Worth grepping for before porting other upsell specs.

## Are the other gates real? YES, and token-gated (so they port fine)

The two sidebar ABSENCE assertions were the other FINDINGS #49 risk — asserting
the *absence* of EE chrome is exactly what "reads wrong on an EE jar". Probed
across three tiers rather than assumed:

| tier              | `Setup guide` link | `Guest embeds` link |
| ----------------- | ------------------ | ------------------- |
| no token          | absent (0)         | absent (0)          |
| `starter`         | absent (0)         | absent (0)          |
| `pro-self-hosted` | **present (1)**    | **present (1)**     |

Token-gated, not build-gated → the OSS/starter expectation is genuinely
reproduced, and the checks are **non-vacuous by inversion**. Mutation-confirmed
end-to-end on the starter twin (swap `starter`→`pro-self-hosted`: test fails
`toHaveCount(0) / Received: 1`).

The OSS tier precondition is **asserted, not assumed**: the beforeEach probes
`/api/session/properties` and requires zero enabled `token-features`. On this
jar `mb.restore()` does leave exactly that, so `@OSS`'s token half is real.

## Second gem icon — EE build fingerprint

`cy.icon("gem")` resolves to **2** elements inside `admin-layout-content` here:
the embedding upsell's gem, plus **"Get a development instance"**
(`dev_instances` upsell) — EE-build chrome upstream never sees on OSS.

That does *not* change the assertion's outcome, because upstream's
`.should("be.visible")` on a multi-element subject is an **ANY-of-set**
assertion: chai-jquery's `visible` is `$el.is(":visible")`, and jQuery `.is()`
is true when **at least one** element matches. So rule 3 applies and
`.filter({ visible: true }).first()` is the *faithful* port — explicitly not a
defensive `.first()`.

Incidental measurement: the `dev_instances` CTA URL carries `source_plan=oss` on
this untokened EE jar, i.e. the upsell plan string derives from token features,
not from the build flag. (The `source_plan` half of the OSS assertion would have
been fine; it is the `<a>`-vs-`<button>` half that is not.)

## Race worth recording

The upsell block renders **asynchronously**. A non-retrying `count()` taken
right after the "Embedding settings" heading became visible returned **0** gems
and **0** links; the same page 2s later had 2 gems. Any probe of upsell content
must wait for it — a `count()`-based absence check there would be vacuous.
