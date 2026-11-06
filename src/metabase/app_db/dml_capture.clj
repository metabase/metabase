(ns metabase.app-db.dml-capture
  "Statement-level capture of DELETEs executed through Toucan 2.

  A model opts in by deriving from [[hook]] and implementing [[capture-fields]] and [[captured!]].
  Each captured `delete!` *statement* delivers exactly one event describing the rows it is about to remove,
  however many there are.

  Event shape (see [[captured!]]):

    {:op :delete, :model model, :rows [pre-image, ...], :dependents (see [[dependents]], optional)}

  Each row is a narrow pre-image snapshot: a plain map of raw column values, holding only the columns named by
  [[capture-fields]], selected with the statement's own conditions immediately before it executes.
  No instance decoration runs on them: no `after-select` methods and no type transforms.

  Deletes are captured because they have no affordable row-level hook: toucan2's `before-delete` realizes a
  full instance per matching row.
  Inserts and updates are deliberately out of scope here.
  They keep their row-level hooks until a capture path for them is designed on its own terms.

  Delivery guarantees, and non-guarantees:

  - One event per statement, delivered on the calling thread after the statement executes but before any
    enclosing transaction commits.
    If the transaction rolls back, the event has already fired: consumers must treat events as \"look at these
    rows again\", never as facts about committed state.
    No consumer needs delivery before commit; it stays there because this namespace is meant to become a
    toucan2 tool, and toucan2 knows nothing of Metabase's commit callbacks.
  - An empty pre-image snapshot delivers no event.
  - A statement matching more rows than [[max-pre-image-rows]] delivers no event, so that a wide delete cannot
    materialize an unbounded result set on the caller's thread.
    This is a capture hole, and a loud one: the consumer's convergence backstop is what covers it.
  - DML that bypasses the model, such as `(t2/delete! (t2/table-name model) ...)` or a raw `t2/query`, delivers
    no event, as it bypasses every other Toucan 2 tool.
  - A model mixing capture with `before-delete` selects the matching rows twice: once for the row-level hook,
    once for the narrow snapshot.
    Capture is deliberately the inner of the two.
  - The pre-image select and the statement are separate, unlocked reads: a concurrent writer can make a
    snapshot over- or under-approximate the rows the statement actually affects.
    Toucan's own `before-delete` has the same window.
    Consumers already must treat events as re-examination hints, so over-approximation is harmless and
    under-approximation is bounded by their convergence backstop."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.execute :as t2.execute]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def hook
  "Models deriving from this keyword get statement-level DML capture."
  ::captured)

;; A missed event degrades to a stale consumer until its convergence backstop runs; an OutOfMemoryError degrades
;; the whole instance.
(def ^:private max-pre-image-rows
  "Row ceiling for a pre-image snapshot.
  A statement matching more rows than this skips capture rather than materializing an unbounded result set on the
  caller's thread."
  10000)

(defmulti capture-fields
  "The columns guaranteed present in `:rows` when capturing `op` statements against `model`.
  Only `:delete` is captured today.
  Return nil or empty to leave that op uncaptured.
  Rows are narrowed to these columns.
  Methods must not query the database: a failed query aborts an enclosing PostgreSQL transaction."
  {:arglists '([model op])}
  (fn [model _op] (keyword model)))

(defmethod capture-fields :default
  [_model _op]
  nil)

(defmulti captured!
  "Deliver a capture event for a DML statement against `model`; see the namespace docstring for the shape.
  Implementations run on the DML's calling thread, inside any enclosing transaction: keep them cheap.
  They must not execute SQL on that transaction's connection: although delivery catches and logs exceptions,
  catching a database error cannot restore a PostgreSQL transaction that the error has already aborted.
  Prefer registering a post-commit handoff; ordinary consumer failures then degrade to a missed event covered by
  the consumer's convergence backstop."
  {:arglists '([model event])}
  (fn [model _event] (keyword model)))

;; This exists because Toucan cannot see database-level `ON DELETE CASCADE`.
;; A consumer that tracks rows of *other* tables has no way to learn which ones a delete took with it: by the time
;; the event arrives they are already gone, and their identity was never derivable from the deleted rows alone.
(defmulti dependents
  "Identify whatever else the statement is about to destroy, while it still exists.
  Called with the pre-image `rows`, before the statement runs; the return value rides on the event as
  `:dependents`, and nil (the default) leaves the key off.
  Implementations run on the calling thread inside the statement's transaction.
  They may query, since nothing has failed yet at this point, but their failures propagate and abort the caller's
  delete, so keep them narrow.
  An implementation that catches a failed query must run it in its own nested transaction: on PostgreSQL the failure
  otherwise aborts the enclosing transaction, and the caller's delete fails anyway."
  {:arglists '([model rows])}
  (fn [model _rows] (keyword model)))

(defmethod dependents :default
  [_model _rows]
  nil)

(defn- deliver-captured!
  [model event]
  (try
    (captured! model event)
    ;; The delete has already run, so a consumer's interrupt is not ours to swallow: restore the thread's interrupt
    ;; status rather than clearing it.
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (log/errorf e "Interrupted delivering DML capture event for %s %s" model (:op event)))
    (catch Exception e
      (log/errorf e "Error delivering DML capture event for %s %s" model (:op event)))))

(defn- restatable-as-select?
  "Whether a DELETE's resolved query can be rebuilt as the SELECT a pre-image snapshot needs."
  [query]
  (or
   ;; A bare primary key, as in `(t2/delete! model 5)`, selects by that key like `(t2/select model 5)`.
   (int? query)
   ;; Otherwise only a HoneySQL map holding nothing but a `:where` can be restated: kv-args deletes such as
   ;; `(t2/delete! model :k v)` resolve to `{}`, and the rest of the codebase passes `{:where ...}`.
   ;; Any other key could change what the DELETE matches, or fail in a SELECT: an aliased `:delete-from` leaves the
   ;; alias unbound, a CTE could run a second time, a LIMIT picks arbitrary rows, and RETURNING is DELETE-only.
   ;; A SQL-args vector or a raw SQL string is valid DELETE input too, but toucan2 would execute it as written.
   (and (map? query)
        (every? #{:where} (keys query)))))

;; Executed modelless because `after-select` methods and type transforms often dereference columns a narrow
;; snapshot doesn't fetch.
;; SQL execution failures propagate, since suppressing one cannot restore a PostgreSQL transaction it already
;; aborted.
(defn- pre-image-rows
  "Select the rows a delete statement is about to affect, narrowed to `fields`, as plain raw-value maps.
  The select is built and compiled through the model's pipeline, so its conditions keep the statement's
  semantics, and runs on the current connection, inside any transaction the statement itself runs in.
  The one difference is that the select also runs the model's `before-select` methods, which the DELETE does not.
  A model whose `before-select` adds conditions would get a snapshot that misses rows, so it should not opt in.
  Returns nil, skipping capture, for a query [[restatable-as-select?]] rejects, for one that fails to build or
  compile as a select, and for a statement matching more than [[max-pre-image-rows]] rows.
  Throws when the select itself fails to execute."
  [query-type model fields parsed-args resolved-query]
  (when (restatable-as-select? resolved-query)
    (when-let [sql-args (try
                          (let [built (-> (t2.pipeline/build query-type model
                                                             (assoc parsed-args :columns (vec fields))
                                                             resolved-query)
                                          (assoc :limit (inc max-pre-image-rows)))]
                            (t2.pipeline/compile query-type model built))
                          (catch Exception e
                            (log/errorf e "Skipping DML capture for %s: could not build pre-image query" model)
                            nil))]
      ;; The LIMIT alone enforces the ceiling: it stops the database sending rows past it, where JDBC drivers such
      ;; as PostgreSQL's would otherwise buffer the whole result set before the reduction sees a row.
      (let [rows (transduce
                  ;; Modelless rows still come back as toucan2 instances; the contract is plain maps.
                  (map #(into {} (t2.realize/realize %)))
                  conj []
                  (t2.execute/reducible-query sql-args))]
        (cond
          ;; Query-inspection tooling (`toucan2.tools.compile/compile`) rebinds execution to hand back the
          ;; compiled query instead of running it, without calling the reducing function, so `transduce` above
          ;; returns that query as is.
          ;; Only rows are rows: anything else means no statement ran, so there is nothing to capture.
          (not (every? map? rows))
          nil

          (< max-pre-image-rows (count rows))
          (do (log/errorf "Skipping DML capture for %s: statement matches more than %d rows"
                          model max-pre-image-rows)
              nil)

          :else
          rows)))))

(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/delete.* #_model ::captured #_resolved-query :default]
  "Capture the pre-image of the rows a DELETE statement matches, then deliver one `:delete` event."
  [rf query-type model parsed-args resolved-query]
  (let [fields (when-not (::captured? parsed-args)
                 (try
                   (capture-fields model :delete)
                   ;; Capture is still skipped and the delete still runs, but the interrupt is the caller's to see.
                   (catch InterruptedException e
                     (.interrupt (Thread/currentThread))
                     (log/warnf e "Skipping DML capture for %s: interrupted in capture-fields" model)
                     nil)
                   (catch Exception e
                     (log/warnf e "Skipping DML capture for %s: capture-fields failed" model)
                     nil)))]
    (if (empty? fields)
      (next-method rf query-type model parsed-args resolved-query)
      (let [rows (pre-image-rows :toucan.query-type/select.instances
                                 model fields parsed-args resolved-query)
            deps (when (seq rows)
                   (dependents model rows))]
        (u/prog1 (next-method rf query-type model (assoc parsed-args ::captured? true) resolved-query)
          (when (seq rows)
            (deliver-captured! model (cond-> {:op :delete, :model model, :rows rows}
                                       deps (assoc :dependents deps)))))))))

;;; A model may mix capture with toucan2's row-level tools; methodical needs to be told the capture method is
;;; the innermost of the pack, i.e. closest to the statement actually executing. A tool that re-dispatched an
;;; upgraded query rather than call `next-method` would re-enter capture, so the method guards with `::captured?`
;;; in `parsed-args`. No tool in toucan2 1.0.575 does that (`before-delete` calls `next-method`), so the guard is
;;; defensive.
;;;
;;; TODO (Chris 2026-07-24) -- this namespace's eventual home is a toucan2 tool. It is pure toucan2
;;; machinery, and its hardest-won content is composition knowledge about toucan2 internals: the prefer
;;; below references another tool's semi-private dispatch keywords, and a tool-dispatch refactor upstream
;;; would break it here silently, whereas toucan2's own test suite could own that contract (the scratch-model
;;; tests port almost verbatim). Upstream could also replace [[pre-image-rows]]'s compile-then-execute-
;;; modelless workaround with a proper decoration-free query type, such as a select.raw sibling of
;;; `:toucan.query-type/select.instances-from-pks`, skipped by after-select and transforms. Incubating here
;;; first: the contract is new, and its sharp edges (modelless execution, the row ceiling, at-least-once
;;; delivery) should survive production contact before being frozen behind a library release cadence.

(methodical/prefer-method! #'t2.pipeline/transduce-query
                           [:toucan.query-type/delete.* :toucan2.tools.before-delete/before-delete :default]
                           [:toucan.query-type/delete.* ::captured :default])
