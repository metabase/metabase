# 63687: static-embed pin map tiles fail with an unauthorized error

## Where the code went
- Fix c56432c2 added `request/as-admin` around both static-embed tile endpoints in
  `src/metabase/embedding/api/embed.clj`. That namespace is now `src/metabase/embedding_rest/api/embed.clj`.
- Card endpoint (`GET /tiles/card/:token/:zoom/:x/:y`, around line 400): still has the `request/as-admin`
  wrapper in embed.clj. July's card hunk only failed to apply because of surrounding churn.
- Dashboard endpoint: 2921ecdcf9f (#81371, image tile url tracking) removed the as-admin from embed.clj and
  routed `embedding_rest/api/common.clj` `process-tiles-query-for-dashcard` through
  `public_sharing_rest/api.clj` `process-tiles-query-for-dashcard`, which does `as-admin` plus
  `binding [api/*current-user-id* nil]`. That is why July's dashboard hunk conflicts.

## Mutant
- `mutant.patch` removes the `request/as-admin` wrapper from the card tile endpoint and drops the now-unused
  `metabase.request.core` require. Those are the exact lines the fix added for this endpoint.
- The deleted e2e used a static-embedded *question* and asserted `/api/embed/tiles/**` returned 200, so the
  card half is the one users hit.
- I kept the dashboard half out of the mutant. At HEAD its as-admin lives in shared code, and removing it
  there either breaks public dashboard tiles too (in the public helper) or also undoes the #81371 nil-user
  binding (swapping the call back to api.tiles). variant-1 is the second option.

## Oracle
`metabase.embedding-rest.api.embed-test/anonymous-tile-query-runs-as-admin-test`. It isn't on master; it
came from d3835864f16 on `regression-corpus-v2` (land-and-cull). `witness.patch` adds it verbatim after
`dashcard-tile-query-test`. It sends session-less `client/client` requests to both tile endpoints.
I ran it together with the four existing tile deftests in each JVM.

Clean HEAD:
    Ran 5 tests in 23.883 seconds
    13 assertions, 0 failures, 0 errors.
Mutant:
    FAIL in ...embed-test/anonymous-tile-query-runs-as-admin-test (http_client.clj:273)
    GET /api/embed/tiles/card/<token>/1/1/1 expected a status code of 200, got 400.
    Response body: You don't have permissions to do that.
    FAIL ... (embed_test.clj:2300)  actual: (not (png? "You don't have permissions to do that."))
    13 assertions, 2 failures, 0 errors.

## Adversarial check
- The failure is the query processor's permission refusal (400, "You don't have permissions to do that."),
  not an exception or timeout. That matches "unauthorized error" in bug.statement.
- On the mutant, the dashcard block of the same deftest passes, so token signing, fixtures and the tile
  renderer all work. `card-tile-query-test` also passes: it hits the same card endpoint with a `:crowberto`
  session and still gets a PNG. The only difference is the missing admin binding on an anonymous request.

## Variants (oracle result)
- variant-1, kill: `common.clj` calls `api.tiles/process-tiles-query-for-dashcard` instead of the public
  helper, so dashcard tiles lose as-admin. This is the pre-fix call shape. It also fails
  `dashcard-tile-query-does-not-save-last-used-parameters-test` (saves `{"_STATE_" ["CA"]}`) because the
  nil-user binding goes too. That's collateral from #81371, not this bug.
- variant-2, kill: as-admin moved inward so it wraps only `tile-parameters-for-card`, not the query.
- variant-3, survive: card endpoint drops `check-embedding-enabled-for-card`. The oracle only uses
  embedding-enabled cards.

## Things that could trip the next person
- Every existing tile test in embed_test.clj uses a `:crowberto` or `:rasta` session. Rasta has data
  perms in the test DB, so neither session can see a missing as-admin. Only an anonymous request can.
- Other test runs on the same machine can start backend JVMs. My runner polled `pgrep -f bin/test-agent` every second and lost
  a race once with a 10s poll.
- Dropping the require is optional. It compiles either way; keeping it only adds an unused-alias warning.
