# Op cache TODOs

Deferred follow-ups for the op-cache work on this branch. Not doing these now — timeboxed, switching to a
hackier short-term approach.

## 1. Lifecycle of the cache protocol objects vs. setting changes

Today `query-op-cache` constructs a fresh `OpCache` (a `reify` closing over the settings) on **every request**,
because its configuration reads settings at construction time:

- `:min-duration-ms` — per-request (comes from the query's cache strategy), genuinely request-scoped
- `:max-size` — `query-caching-max-kb` (admin-settable, DB-backed setting)
- `:stale-grace-ms` / `:claim-ttl-ms` — `query-caching-stale-grace-seconds` / `query-caching-refresh-lease-seconds`
  (`:visibility :internal`, so in practice env-var/API-settable)

Investigate the desired lifecycle of cache setting changes. Can we statically create the protocol impl objects at
startup, or at least less often than per request?

- If the relevant settings are effectively only settable by env vars, the objects can safely be created once at
  init/load time.
- If admin-settable settings (`query-caching-max-kb`) must take effect without restart, options: read settings at
  *call* time inside a singleton object instead of construction time; or rebuild the object on settings-change
  events; or keep only the truly per-request piece (`:min-duration-ms`) as a per-call option and hoist the rest.
- `*storage*` itself is already effectively static (created at namespace load); only the `OpCache` wrapper is
  rebuilt per request.

## 2. Queries that want to JOIN cache entries against other models

`duration-queries-to-rerun` (EE preemptive refresh) used to SQL-join `query_execution` against the cache table.
After decoupling, it fetches the fresh-key set via `keys-written-since` and filters candidates app-side — correct,
but the fresh-key set is instance-wide and unbounded in pathological cases (see the perf note in the PR
discussion). Two candidate long-term designs:

**Option A — composite protocol.** Make a composite protocol encapsulating all the models the query needs to join
(cache entries + Query + QueryExecution). Clients query via the protocol, not directly; the app-db implementation
is free to do a real SQL join internally, while an in-memory implementation joins in Clojure. Keeps the model
private and restores join efficiency.

**Option B — duplicative denormalization.** Store whatever metadata the join needs on the *other* model instead.
E.g. `QueryExecution` gains columns for when its query's result was written to the cache and its expected-stale
time. `duration-queries-to-rerun-honeysql` then queries only `query` + `query_execution` — never the op cache.
Tolerate the corner case where `query_execution`'s copy and the op cache disagree (a race), and do a cheap
double-check as a post-processing step (e.g. per-candidate `read-entry`, bounded by candidate count).
