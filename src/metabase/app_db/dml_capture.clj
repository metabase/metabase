(ns metabase.app-db.dml-capture
  "Statement-level capture of DELETEs executed through Toucan 2.

  A model opts in by deriving from [[hook]] and implementing [[capture-fields]] and [[captured!]].
  Each captured `delete!` *statement* delivers exactly one event describing the rows it is about to remove,
  however many there are.

  Event shape (see [[captured!]]):

    {:op :delete, :model model, :rows [pre-image, ...]}

  `:rows` are narrow pre-image snapshots: plain maps of raw column values, only the columns named by
  [[capture-fields]], selected with the statement's own conditions immediately before it executes.
  No instance decoration runs on them — no `after-select` methods, no type transforms.

  Deletes are captured because they have no affordable row-level hook: toucan2's `before-delete` realizes a
  full instance per matching row. Inserts and updates are deliberately out of scope here; they keep their
  row-level hooks until a capture path for them is designed on its own terms.

  Delivery guarantees, and non-guarantees:

  - One event per statement, delivered on the calling thread after the statement executes but before any
    enclosing transaction commits. If the transaction rolls back, the event has already fired: consumers must
    treat events as \"look at these rows again\", never as facts about committed state.
  - An empty pre-image snapshot delivers no event.
  - A statement matching more rows than [[max-pre-image-rows]] delivers no event, so that a wide delete cannot
    materialize an unbounded result set on the caller's thread. This is a capture hole, and a loud one: the
    consumer's convergence backstop is what covers it.
  - DML that bypasses the model — `(t2/delete! (t2/table-name model) ...)`, raw `t2/query` — delivers no
    event, exactly as it bypasses every other Toucan 2 tool.
  - A model mixing capture with `before-delete` selects the matching rows twice: once for the row-level hook,
    once for the narrow snapshot. Capture is deliberately the inner of the two.
  - The pre-image select and the statement are separate, unlocked reads: a concurrent writer can make a
    snapshot over- or under-approximate the rows the statement actually affects. toucan2's own
    `before-delete` has the same window. Consumers already must treat events as re-examination hints, so
    over-approximation is harmless and under-approximation is bounded by their convergence backstop."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.execute :as t2.execute]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.realize :as t2.realize]))

(def hook
  "Models deriving from this keyword get statement-level DML capture."
  ::captured)

(def ^:private max-pre-image-rows
  "Row ceiling for a pre-image snapshot. A statement matching more rows than this skips capture rather than
  materializing an unbounded result set on the caller's thread: a missed event degrades to a stale consumer
  until its convergence backstop runs, an OutOfMemoryError degrades the whole instance."
  10000)

(defmulti capture-fields
  "The columns guaranteed present in `:rows` when capturing `op` (currently only `:delete`) statements against
  `model`; return nil or empty to leave that op uncaptured.
  Rows are narrowed to these columns."
  {:arglists '([model op])}
  (fn [model _op] (keyword model)))

(defmethod capture-fields :default
  [_model _op]
  nil)

(defmulti captured!
  "Deliver a capture event for a DML statement against `model`; see the namespace docstring for the shape.
  Implementations run on the DML's calling thread, inside any enclosing transaction: keep them cheap.
  They must not execute SQL on that transaction's connection: although delivery catches and logs exceptions,
  catching a database error cannot restore a PostgreSQL transaction that the error has already aborted. Prefer
  registering a post-commit handoff; ordinary consumer failures then degrade to a missed event covered by the
  consumer's convergence backstop."
  {:arglists '([model event])}
  (fn [model _event] (keyword model)))

(defn- deliver-captured!
  [model event]
  (try
    (captured! model event)
    (catch Throwable e
      (log/errorf e "Error delivering DML capture event for %s %s" model (:op event)))))

(defn- delete-query->select-query
  "Restate an explicit HoneySQL DELETE map as something a SELECT can be built from.
  Toucan 2 lets a caller pass one to `delete!`, and building a SELECT from it would keep the `:delete` and
  `:delete-from` keys and compile to nonsense. `before-delete` gets this same workaround from
  [[metabase.app-db.setup]], but only under its own dispatch value, so capture has to do it for itself
  (https://github.com/camsaul/toucan2/issues/203)."
  [query]
  (if-not (map? query)
    query
    (cond-> (dissoc query :delete)
      (contains? query :delete-from) (-> (dissoc :delete-from)
                                         (assoc :from [(:delete-from query)])))))

(defn- pre-image-rows
  "Select the rows a delete statement is about to affect, narrowed to `fields`, as plain raw-value maps.
  The select is built and compiled through the model's pipeline so conditions keep the statement's exact
  semantics, but executed modelless: `after-select` methods and type transforms often dereference columns a
  narrow snapshot doesn't fetch, so no instance decoration may run here.
  Runs on the current connection, so inside any transaction the statement itself runs in.
  Returns nil, and skips capture, for a query shape we cannot build or compile as a select (e.g. raw sql-args
  with kv-args) and for a statement matching more than [[max-pre-image-rows]] rows.
  SQL execution failures propagate: suppressing one cannot restore a PostgreSQL transaction it already aborted."
  [query-type model fields parsed-args resolved-query]
  (when-let [sql-args (try
                        (let [built (t2.pipeline/build query-type model
                                                       (assoc parsed-args :columns (vec fields))
                                                       (delete-query->select-query resolved-query))]
                          (t2.pipeline/compile query-type model built))
                        (catch Exception e
                          (log/errorf e "Skipping DML capture for %s: could not build pre-image query" model)
                          nil))]
    ;; Reduce rather than realize the whole result set, so one row past the ceiling is all a wide statement
    ;; ever pulls into heap.
    (let [rows (into [] (comp (take (inc max-pre-image-rows)) (map t2.realize/realize))
                     (t2.execute/reducible-query sql-args))]
      (cond
        ;; Query-inspection tooling (`toucan2.tools.compile/compile`) rebinds execution to hand back the
        ;; compiled query instead of running it. Only rows are rows: anything else means no statement ran, so
        ;; there is nothing to capture.
        (not (every? map? rows))
        nil

        (< max-pre-image-rows (count rows))
        (log/errorf "Skipping DML capture for %s: statement matches more than %d rows"
                    model max-pre-image-rows)

        :else rows))))

(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/delete.* #_model ::captured #_resolved-query :default]
  "Capture the pre-image of the rows a DELETE statement matches, then deliver one `:delete` event."
  [rf query-type model parsed-args resolved-query]
  (let [fields (when-not (::captured? parsed-args)
                 (capture-fields model :delete))]
    (if (empty? fields)
      (next-method rf query-type model parsed-args resolved-query)
      (let [rows (pre-image-rows :toucan.query-type/select.instances
                                 model fields parsed-args resolved-query)]
        (u/prog1 (next-method rf query-type model (assoc parsed-args ::captured? true) resolved-query)
          (when (seq rows)
            (deliver-captured! model {:op :delete, :model model, :rows rows})))))))

;;; A model may mix capture with toucan2's row-level tools; methodical needs to be told the capture method is
;;; the innermost of the pack, i.e. closest to the statement actually executing. Tools that re-dispatch an
;;; upgraded query rather than call `next-method` would otherwise re-enter capture, so the method guards with
;;; `::captured?` in `parsed-args`.
;;;
;;; TODO (Chris 2026-07-24) -- this namespace's eventual home is a toucan2 tool. It is pure toucan2
;;; machinery, and its hardest-won content is composition knowledge about toucan2 internals: the prefer
;;; below references another tool's semi-private dispatch keywords, and a tool-dispatch refactor upstream
;;; would break it here silently, whereas toucan2's own test suite could own that contract (the scratch-model
;;; tests port almost verbatim). Upstream could also replace [[pre-image-rows]]'s compile-then-execute-
;;; modelless workaround with a proper decoration-free query type — a select.raw sibling of
;;; `:toucan.query-type/select.instances-from-pks`, skipped by after-select and transforms. Incubating here
;;; first: the contract is new, and its sharp edges (modelless execution, the row ceiling, at-least-once
;;; delivery) should survive production contact before being frozen behind a library release cadence.

(methodical/prefer-method! #'t2.pipeline/transduce-query
                           [:toucan.query-type/delete.* :toucan2.tools.before-delete/before-delete :default]
                           [:toucan.query-type/delete.* ::captured :default])
