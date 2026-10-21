(ns metabase.documents.content-gate-cache
  "Request- or loop-scoped memo of document content-gate verdicts, read by
  [[metabase.documents.models.document/content-visible?]]. Kept free of heavy requires so the server
  middleware can bind it without loading the documents module.")

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "Cache atom bound by [[with-content-gate-cache]], or nil to adjudicate on every call.

  Verdicts are keyed `[user-id is-superuser? doc-id]`, so a scope that changes effective perms
  without changing those (`with-database-routing-off`, `perms/with-additional-table-permission`,
  rebinding `*current-user-permissions-set*`) must not straddle a cached verdict."
  nil)

(defn do-with-content-gate-cache
  "Function form of [[with-content-gate-cache]]."
  [thunk]
  (binding [*cache* (or *cache* (atom {}))]
    (thunk)))

(defmacro with-content-gate-cache
  "Adjudicate each document's content at most once for the duration of `body`. Nesting reuses the
  enclosing cache.

  The verdict is a rollup over the owning exploration's threads and costs roughly twenty app-DB
  queries, so anything looping over documents — or over the Cards scoped to one, which all resolve
  to the same document and so to the same verdict — otherwise pays it once per row. API requests
  each run under one already; scope it around such a loop anywhere else."
  {:style/indent 0}
  [& body]
  `(do-with-content-gate-cache (fn [] ~@body)))
