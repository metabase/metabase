The mutation is in place. This is a backend fix, so per the instructions no jest witness is possible; I'll report `no_witness_backend`.

## Report

### 1. git diff (product mutation)
Semantic revert of fix commit `c56432c2` (which moved to `src/metabase/embedding_rest/api/embed.clj` after a package rename `embedding/api` → `embedding_rest/api`). Removed the `request/as-admin` wrapper from both static-embedding tiles endpoints and dropped the now-unused `metabase.request.core` require:

```clojure
;; /tiles/card/:token/:zoom/:x/:y
-    (request/as-admin
-      (api.tiles/process-tiles-query-for-card card parameters zoom x y lat-field lon-field))))
+    (api.tiles/process-tiles-query-for-card card parameters zoom x y lat-field lon-field)))

;; /tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y
-    (request/as-admin
-      (api.embed.common/process-tiles-query-for-dashcard dashboard dashcard card ...))))
+    (api.embed.common/process-tiles-query-for-dashcard dashboard dashcard card ...)))
```

### 2. Witness
None — backend fix. The observable is the HTTP status of a Clojure API endpoint governed by request-bound user/permission context (`request/as-admin` binds `*current-user*` to an admin with `#{"/"}` perms via `metabase.request.session/do-as-admin`). There is no frontend/jsdom seam: the frontend just renders `<img>` tiles from the embed URL; the pass/fail is decided entirely server-side by the query processor's permission enforcement. A jest test cannot discriminate it.

The correct oracle is a Clojure `deftest` in the existing namespace `test/metabase/embedding_rest/api/embed_test.clj` (which already exercises these exact endpoints at lines 1881–1906). The bug-catching version must call the endpoint **anonymously** (no session user — as a real static-embed iframe does) and assert HTTP 200:
```clojure
(mt/client :get 200 (format "embed/tiles/card/%s/1/1/1" token)
           :latField (tiles.api-test/encoded-lat-field-ref)
           :lonField (tiles.api-test/encoded-lon-field-ref))
```
On the mutant this returns a non-200 (permission failure) because the tiles query runs with no current user / no data perms instead of as admin. (Note: the existing tests pass `:crowberto`, an authenticated admin, so they would NOT catch the mutant — the oracle must be anonymous, matching the e2e which loads the iframe with only a JWT and no session.)

### 3. Bug summary
On static (JWT-signed) embedding, requesting a pin-map tile runs the underlying tiles query without an admin/user context. Since static embed requests carry no authenticated session user, the query processor's permission check has no granting user and the tile request fails (non-200 / auth error), so pin-map tiles render broken. The e2e repro (`issue 63687`, `embedding-reproductions.cy.spec.js:1569`) intercepts `/api/embed/tiles/**` and asserts `statusCode === 200`. The fix wraps tile processing in `request/as-admin` so the query executes with full permissions when the JWT is valid.

### 4. Outcome
`no_witness_backend` — class: backend, Clojure-testable (not irreducible). The fix is pure Clojure in `embedding_rest/api/embed.clj`; the cheaper oracle is a `deftest` hitting the anonymous embed tiles endpoint, not a Cypress spec.

### 5. Confidence
High. The mutation is the exact inverse of the fix commit's product change, applied at the drifted location. `request/as-admin` (`metabase.request.session`) is precisely what binds an admin current-user with root permissions around the tiles query; removing it restores the pre-fix behavior where the query runs without a permission-granting user, reproducing the auth failure the e2e checks. No jsdom/layout/routing/browser-API dependency exists — the discriminating signal is a server-side HTTP status, fully reproducible in a JVM test.