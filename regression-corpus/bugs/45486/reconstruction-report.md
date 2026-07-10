Reconstruction succeeded. Summary follows.

## 1. `git diff`

Single-file semantic revert in `enterprise/frontend/src/metabase-enterprise/whitelabel/components/FontWidget/utils.ts`, function `getFontFormat`:

```diff
 const getFontFormat = (src: string): FontFormat => {
-  try {
-    const url = new URL(src);
-    const extension = url.pathname.substring(url.pathname.lastIndexOf("."));
-    switch (extension) { ... }
-  } catch {
-    return "woff2";
-  }
+  const extension = src.substring(src.lastIndexOf("."));
+  switch (extension) { ... }
 };
```

The fix parsed the URL with `new URL(src)` and read the extension off `url.pathname`, which strips any `?query`. The revert reads the extension off the raw `src`, so a query string pollutes the extension match. (Product code, not `git apply -R` — the rest of the FontWidget rewrite stays intact.)

## 2. Oracle + Tests

- Oracle spec: `enterprise/frontend/src/metabase-enterprise/whitelabel/components/FontWidget/FontWidget.unit.spec.tsx` (surviving; near-identical to the fix-commit version, only helper drift in `clickSelect`/imports).
- Baseline (fix present): `Tests: 10 passed, 10 total`
- Reconstructed (fix reverted): `Tests: 1 failed, 9 passed, 10 total`

## 3. Failure shape

The fix-added test `font files › should add a font file with a query param` fails. Input `https://example.com/regular.ttf?hash=1337h4x0r`:
```
- "fontFormat": "truetype"   (expected — .ttf recognized after query stripped)
+ "fontFormat": "woff2"      (received — extension parsed as ".ttf?hash=1337h4x0r", falls to default)
```
A single deep-equality assertion failure on the PUT body; clean and targeted.

## 4. Confidence + adversarial

Confidence: high. This is a genuine fix-vs-bug discriminator, not an arbitrary break:
- The query-param test was added in the same commit specifically to cover URL-with-query handling — exactly the semantic content of the `new URL().pathname` fix.
- Adversarial check: the sibling test `should accept a font file with an invalid url` still passes (both implementations fall back to `woff2` for unparseable input, so the `try/catch` removal alone is not observable), and `should update font urls` still passes (plain `.ttf/.woff/.woff2` with no query parse identically). So only the query-param path — the true locus of the fix — flips. Any implementation that makes this assertion pass must strip the query string, i.e. must contain the fix. No smarter product variant keeps the test green without re-implementing the fix.

## 5. Ambiguity

Note on scope: metabase#45486's fix commit (a59d8af5, PR #56468 "Update Appearance Settings") is a large multi-concern refactor. The literal one-line change at the named primary product file `SdkThemeProvider.tsx` (`appColors` → `appColors ?? {}`) is an SDK-theme concern with no surviving unit-spec coverage in this bundle. Per the PARTIAL-bucket instructions, I reconstructed against the surviving discriminating oracle spec (FontWidget), localizing to a co-shipped "other" product file (`FontWidget/utils.ts`, listed under "+ others"). The reconstruction is faithful to a fix-added assertion in that surviving spec, not to the SDK one-liner. No further ambiguity in the reconstruction itself.