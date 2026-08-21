(ns metabase.documents.content-visibility
  "The content-visibility gate for documents, and the scoped memo callers use so a loop does not pay
  for it once per row.

  A leaf namespace so a caller can scope the memo without loading the documents API layer that
  `metabase.documents.core` pulls in; `core` re-exports both public vars for convenience."
  (:require
   [metabase.api.common :as api]))

(defonce ^{:doc "Predicate gating a document's *content* (not merely its existence) below
                 collection-read, for documents whose rendered body embeds data the viewer may not
                 be entitled to see. Installed at init.

                 The only user today is `explorations`: a Summary document belongs to an
                 exploration (the `:exploration_id` FK on the document table) and embeds verbatim —
                 possibly sandboxed/impersonated/routed — result values, so a collaborator whose
                 data-access lens differs from the creator's must not read it.

                 `documents` can't call the consumer directly — the module graph runs one way
                 (`explorations -> documents`) — so the consumer registers a callback here."}
  doc-content-visibility-fn
  (atom (fn [_doc] true)))

(defn register-doc-content-visibility-fn!
  "Install the content-visibility gate (see [[doc-content-visibility-fn]]). Called once at the
  consuming module's init. `f` takes a document and returns whether the current user may see its
  rendered content."
  [f]
  (reset! doc-content-visibility-fn f))

(def ^:private ^:dynamic *content-gate-pending*
  "Document ids whose content gate is currently being evaluated on this thread.

  The gate is re-entrant by construction: adjudicating a document's content runs query-permission
  checks, and those read-check the source Cards of the queries involved — a Card scoped to a
  Document delegates back to that Document's gate. A document whose visibility depends on itself
  has no answer, so deny rather than recur into a stack overflow inside an authorization check."
  #{})

(def ^:dynamic *cache*
  "Cache atom bound by [[with-content-gate-cache]], or nil to adjudicate on every call."
  nil)

(defmacro with-content-gate-cache
  "Adjudicate each document's content at most once for the duration of `body`. Nesting reuses the
  enclosing cache.

  The verdict is a rollup over the owning exploration's threads and costs roughly twenty app-DB
  queries, so anything looping over documents — or over the Cards scoped to one, which all resolve
  to the same document and so to the same verdict — otherwise pays it once per row. Scope it around
  such a loop; everywhere else reads through."
  {:style/indent 0}
  [& body]
  `(binding [*cache* (or *cache* (atom {}))]
     ~@body))

(defn content-visible?
  "Run the registered content-visibility gate for `document`, guarding against re-entry and reusing
  a verdict already reached under [[with-content-gate-cache]]."
  [document]
  (let [id      (:id document)
        ;; Keyed by viewer as well as document: a verdict is only ever valid for the user it was
        ;; computed for, so a cache that outlives or crosses a user binding misses rather than
        ;; handing back someone else's answer.
        k       [api/*current-user-id* api/*is-superuser?* id]
        adjudge (fn []
                  (if (contains? *content-gate-pending* id)
                    false
                    (binding [*content-gate-pending* (cond-> *content-gate-pending* id (conj id))]
                      (boolean (@doc-content-visibility-fn document)))))]
    (if (and id *cache*)
      (if-some [cached (get @*cache* k)]
        cached
        (let [verdict (adjudge)]
          (swap! *cache* assoc k verdict)
          verdict))
      (adjudge))))
