(ns metabase.lib.schema.annotation
  "The [[metabase.util.annotation/Annotation]] keys the query processor and permission code add to queries, stages,
  joins, and clause options. Because each is a distinct object with no JSON representation, a client cannot forge one by
  including it in a query sent to the API -- which is why these annotations can be trusted for permission enforcement
  and other internal decisions. Read and write them with `get`/`assoc`/`dissoc` (or call them like a keyword) as any
  other map key.

  Their value types are declared on the schemas of the maps they live on (the query, stage, join, and field-ref
  options schemas)."
  (:require
   [metabase.util.annotation :as u.annotation]))

(def ignore-coercion
  "Marker in a `:field` clause's options: coercion has already been handled at a nested stage, so the compiler must not
  coerce this ref again. Added when nesting expressions and joins."
  (u.annotation/annotation :lib/ignore-coercion))

(def source-card-id
  "Top-level query key recording the Card ID a query was ultimately sourced from, so result-metadata handling can tell
  whether the query came from a Card. Set by `fetch-source-query`."
  (u.annotation/annotation :lib/source-card-id))

(def skip-persisted-cache
  "Marker on a stage telling the SQL compiler not to substitute a persisted/cached table for it."
  (u.annotation/annotation :lib/skip-persisted-cache))

(def skip-result-metadata-persistence
  "Top-level query key telling the results-metadata middleware not to persist `result_metadata` back to the Card."
  (u.annotation/annotation :lib/skip-result-metadata-persistence))

(def added-implicit-fields?
  "Marker on a stage: `add-implicit-clauses` added implicit `:fields` to it."
  (u.annotation/annotation :lib/added-implicit-fields?))

(def is-implicit-join
  "Marker on a join: it is an implicit FK join added by `add-implicit-joins`, not one the user wrote."
  (u.annotation/annotation :lib/is-implicit-join))

(def keep-default-join-alias
  "Marker on a join telling MBQL 5 -> legacy conversion to keep the auto-generated default join alias."
  (u.annotation/annotation :lib/keep-default-join-alias))

(def stage-is-from-source-card
  "Marker on a stage recording the Card ID it was resolved from. Drives read-permission checks, so a client must not be
  able to supply it. Set by `fetch-source-query`."
  (u.annotation/annotation :lib/stage-is-from-source-card))

(def stage-had-source-card
  "Marker on a stage recording the Card ID whose query was spliced in to produce it. Read by permission enforcement and
  field resolution. Set by `fetch-source-query`."
  (u.annotation/annotation :lib/stage-had-source-card))

(def source-query-model?
  "Marker on a stage: the source Card spliced in to produce it is a model."
  (u.annotation/annotation :lib/source-query-model?))

(def source-query-native-model?
  "Marker on a stage: the source Card spliced in to produce it is a native-query model."
  (u.annotation/annotation :lib/source-query-native-model?))

(def persisted-info-native
  "Marker on a stage holding the persisted/cached native query the SQL compiler may substitute for it. Set by
  `fetch-source-query`."
  (u.annotation/annotation :lib/persisted-info-native))

(def sandboxed-table
  "Marker on a stage recording the Table ID a sandbox (GTAP) was applied to. Drives permission checks, so a client must
  not be able to supply it. Set by the EE sandboxing middleware."
  (u.annotation/annotation :lib/sandboxed-table))

(def impersonation-role
  "Top-level query key holding the connection-impersonation role to apply. Part of the query hash, so cached results are
  scoped to the role. Set by the EE impersonation middleware."
  (u.annotation/annotation :lib/impersonation-role))

(def impersonation-admin?
  "Top-level query key: the impersonating user is an admin, so their native query need not be a single statement of the
  required type. Set by the EE impersonation middleware."
  (u.annotation/annotation :lib/impersonation-admin?))

(def referenced-card-ids
  "Set of Card IDs a query references (via `card__N` source tables or `{{#card}}` native tags). Drives collection-read
  permission checks. Set by the QP; a client cannot forge one to weaken (or would only strengthen) required perms."
  (u.annotation/annotation :lib/referenced-card-ids))

(def compiled
  "Top-level key holding the compiled native form of a query. Set by the compile step; a client must not supply it, as
  it would bypass MBQL compilation."
  (u.annotation/annotation :lib/compiled))

(def compiled-inline
  "Top-level key holding the compiled native form with parameters inlined."
  (u.annotation/annotation :lib/compiled-inline))

(def allow-coercion-for-columns-without-integer-source-table
  "Field-ref options marker forcing coercion even for a column without an integer source-table. Read by the SQL
  compiler; a client must not be able to supply it."
  (u.annotation/annotation :lib/allow-coercion-for-columns-without-integer-source-table))
