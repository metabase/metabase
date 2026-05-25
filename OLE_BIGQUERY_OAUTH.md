# Per-User Google OAuth for BigQuery — Ole Internal Feature

## What This Is

Every Metabase user authenticates to BigQuery with their own Google account instead of a shared service account. This means:
- BigQuery audit logs show real user emails (not the service account)
- IAM permissions can be set per user in Google Cloud
- This is an **internal Ole fork** — not intended for upstream Metabase

## Branch

`ole/bigquery-oauth` on `https://github.com/Olelife/metabase`

## How It Works

1. User logs into Metabase normally (unchanged)
2. On first BigQuery query, they see a prompt: "Connect your Google account"
3. OAuth flow redirects to Google consent screen (BigQuery + Drive scopes)
4. Tokens stored encrypted in `core_user` table
5. All interactive queries use the user's token; sync/connection tests/background jobs use the service account

## New Files

| File | Purpose |
|------|---------|
| `src/metabase/bigquery_oauth/api.clj` | OAuth endpoints: authorize, callback, status, disconnect |
| `src/metabase/bigquery_oauth/settings.clj` | Two settings: client ID and secret (env vars only) |
| `resources/migrations/062/20260523_bigquery_oauth_tokens.yaml` | Adds 3 columns to `core_user` |
| `frontend/src/metabase/api/google-bigquery.ts` | RTK Query endpoints |
| `frontend/src/metabase/account/profile/components/UserProfileForm/GoogleAccountSection.tsx` | Connect/Disconnect UI in user profile |
| `frontend/src/metabase/querying/components/QueryVisualization/VisualizationError/BigQueryOAuthPrompt.tsx` | Error modal when user has no token |

## Modified Files

| File | Change |
|------|--------|
| `modules/drivers/bigquery-cloud-sdk/src/metabase/driver/bigquery_cloud_sdk.clj` | `database-details->client` uses user OAuth when available; `execute-reducible-query` throws `google-oauth-required` for interactive queries with no token |
| `src/metabase/api_routes/routes.clj` | Registers `/api/google-bigquery` routes |
| `src/metabase/query_processor/error_type.clj` | Adds `google-oauth-required` error type |
| `src/metabase/users/models/user.clj` | Encrypted transforms for token fields |
| `src/metabase/query_processor/middleware/cache.clj` | Disables Metabase result cache for BigQuery (see below) |
| `frontend/src/metabase/querying/components/QueryVisualization/VisualizationError/VisualizationError.tsx` | Handles `google-oauth-required` error type |

## Configuration (env vars)

```
MB_GOOGLE_BIGQUERY_OAUTH_CLIENT_ID=<your-oauth-client-id>
MB_GOOGLE_BIGQUERY_OAUTH_CLIENT_SECRET=<your-oauth-client-secret>
```

Set these in Google Cloud Console → APIs & Credentials → OAuth 2.0 Client (Web Application type).

**Authorized redirect URI to register:** `https://<your-host>/api/google-bigquery/callback`

For local dev: `http://localhost:3000/api/google-bigquery/callback`

## OAuth Scopes

```
https://www.googleapis.com/auth/bigquery
https://www.googleapis.com/auth/drive.readonly
openid
email
```

- `bigquery` (not `bigquery.readonly`) — required to create jobs (run queries)
- `drive.readonly` — required for BigQuery external tables backed by Google Sheets
- `openid email` — user identity

## Key Implementation Details

### driver-api/current-user is a Delay
`driver-api/current-user` returns a Delay object. Always dereference with `@`:
```clojure
(when-let [user @(driver-api/current-user)] ...)  ; correct
(when-let [user (driver-api/current-user)] ...)   ; wrong — always truthy
```

### Interactive vs background queries
Use `(get-in outer-query [:middleware :userland-query?])` to distinguish interactive queries from sync/fingerprinting. Only throw `google-oauth-required` for interactive queries.

### Project ID with user credentials
`OAuth2Credentials` doesn't carry a project ID. Use `bigquery.common/get-project-id details` (not `(:project-id details)` directly) — it falls back to reading from the service account JSON if the explicit field is not set.

### Metabase query cache is disabled for BigQuery

Metabase's result cache keys on query structure only — not user identity. With per-user OAuth, User A's cached results could be served to User B, bypassing BigQuery IAM entirely.

The fix is in `cache.clj`: `is-cacheable?` returns `false` when `driver/*driver*` is `:bigquery-cloud-sdk`. BigQuery's own project-level result cache handles repeated identical queries for free (0 bytes billed), so there is no practical cost to disabling Metabase's cache for BigQuery.

Note: BigQuery's native cache does **not** work for queries with non-deterministic functions (`NOW()`, `CURRENT_DATE()`, etc.), streaming buffer tables, or Google Sheets external tables. Those queries will always hit BigQuery.

### Settings use env vars only
`defsetting` with `:visibility :internal :setter :none` bypasses the i18n requirement (no `deferred-tru` needed). Settings are read-only from env vars.

## Local Dev Workflow

```bash
# Run backend (serves pre-built frontend from resources/frontend_client/)
clojure -M:dev:dev-start

# After changing backend code (non-driver):
# just restart clojure -M:dev:dev-start

# After changing the BigQuery driver:
clojure -X:build:drivers:build/driver :driver :bigquery-cloud-sdk
cp resources/modules/bigquery-cloud-sdk.metabase-driver.jar plugins/
# then restart

# H2 database persists at ~/.metabase/metabase.db.mv.db
```

## Syncing with Upstream Metabase

```bash
git checkout master
git pull upstream master
git push origin master

git checkout ole/bigquery-oauth
git rebase master
git push origin ole/bigquery-oauth --force-with-lease
```

`upstream` = `https://github.com/metabase/metabase.git`
`origin` = `https://github.com/Olelife/metabase.git`
