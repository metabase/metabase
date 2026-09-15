(ns metabase.app-db.dml-capture
  "Statement-level capture of DML executed through Toucan 2.

  A model opts in by deriving from [[hook]] and implementing [[capture-fields]] and [[captured!]].
  Each captured `insert!`/`update!`/`delete!` *statement* delivers exactly one event describing the affected
  rows, however many there are.

  Event shape (see [[captured!]]):

    {:op :delete, :model model, :rows [pre-image, ...]}
    {:op :update, :model model, :rows [pre-image, ...], :changes changes}
    {:op :insert, :model model, :rows [row, ...], :pks [pk, ...]}

  Update and delete `:rows` are narrow pre-image snapshots: plain maps of raw column values, only the
  columns named by [[capture-fields]], selected with the statement's own conditions immediately before it
  executes.
  No instance decoration runs on them — no `after-select` methods, no type transforms.
  `:changes` is the update statement's changes map; every affected row received these same changes, so the
  post-image of a captured column is `(merge pre-image (select-keys changes capture-fields))` whenever its
  changed value is a literal.
  HoneySQL expression values are delivered as-is.

  Insert `:rows` contain the requested capture fields plus primary-key columns, and `:pks` are the generated
  primary keys. PK-only capture, complete literal rows with explicit PKs, and a single complete literal row need
  no follow-up select. Other inserts are re-selected by primary key because JDBC does not guarantee that returned
  keys preserve input order; each row therefore carries its own authoritative identity rather than relying on
  positional association.

  Delivery guarantees, and non-guarantees:

  - One event per statement, delivered on the calling thread after the statement executes but before any
    enclosing transaction commits. If the transaction rolls back, the event has already fired: consumers must
    treat events as \"look at these rows again\", never as facts about committed state.
  - An empty pre-image snapshot delivers no update/delete event.
  - DML that bypasses the model — `(t2/delete! (t2/table-name model) ...)`, raw `t2/query` — delivers no
    event, exactly as it bypasses every other Toucan 2 tool.
  - `update!` statements rewritten by a `before-update` method are captured after the rewrite: `:changes` is
    what actually ran, and a before-update that splits one statement into per-row groups delivers one event
    per group.
  - The pre-image select and the statement are separate, unlocked reads: a concurrent writer can make a
    snapshot over- or under-approximate the rows the statement actually affects. toucan2's own
    `before-delete` has the same window. Consumers already must treat events as re-examination hints, so
    over-approximation is harmless and under-approximation is bounded by their convergence backstop."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.conn]
   [toucan2.execute :as t2.execute]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.realize :as t2.realize]
   [toucan2.types :as t2.types]))

(def hook
  "Models deriving from this keyword get statement-level DML capture."
  ::captured)

(defmulti capture-fields
  "The columns guaranteed present in `:rows` when capturing `op` (`:insert`, `:update` or `:delete`)
  statements against `model`; return nil or empty to leave that op uncaptured.
  Update and delete rows are narrowed to these columns; insert rows additionally include all primary-key columns."
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

(defn- pre-image-rows
  "Select the rows a delete/update statement is about to affect, narrowed to `fields`, as plain raw-value maps.
  The select is built and compiled through the model's pipeline so conditions keep the statement's exact
  semantics, but executed modelless: `after-select` methods and type transforms often dereference columns a
  narrow snapshot doesn't fetch, so no instance decoration may run here.
  Runs on the current connection, so inside any transaction the statement itself runs in.
  A query shape we cannot build or compile as a select (e.g. raw sql-args with kv-args) logs and skips capture.
  SQL execution failures propagate: suppressing one cannot restore a PostgreSQL transaction it already aborted."
  [query-type model fields parsed-args resolved-query]
  (when-let [sql-args (try
                        (let [built (t2.pipeline/build query-type model
                                                       (assoc parsed-args :columns (vec fields))
                                                       resolved-query)]
                          (t2.pipeline/compile query-type model built))
                        (catch Exception e
                          (log/errorf e "Skipping DML capture for %s: could not build pre-image query" model)
                          nil))]
    (t2.execute/query sql-args)))

(defn- rows-by-pks
  [model fields pks]
  (let [pk-set (set pks)
        pk-fn  (t2.model/select-pks-fn model)]
    (some->> (pre-image-rows :toucan.query-type/select.instances model fields
                             {:kv-args {:toucan/pk [:in pks]}} {})
             (filterv #(contains? pk-set (pk-fn %))))))

(defn- pk->row
  [pk-keys pk]
  (zipmap pk-keys (if (= 1 (count pk-keys)) [pk] pk)))

(defn- literal-value?
  [x]
  ;; HoneySQL expressions are represented by collections, keywords (e.g. :%now), or symbols. Be conservative:
  ;; an unnecessary narrow backfill is cheaper than treating an expression as its persisted value.
  (not (or (coll? x) (keyword? x) (symbol? x))))

(defn- complete-literal-row?
  [row fields non-pk-fields]
  (and (every? #(contains? row %) fields)
       (every? #(literal-value? (get row %)) non-pk-fields)))

(defn- insert-rows
  [model fields row-literals pks]
  (let [pk-keys          (vec (t2.model/primary-keys model))
        non-pk-fields    (remove (set pk-keys) fields)
        pk-only?         (every? (set pk-keys) fields)
        complete-rows    (when (every? #(complete-literal-row? % fields non-pk-fields) row-literals)
                           (mapv #(select-keys % fields) row-literals))
        pk-fn            (t2.model/select-pks-fn model)
        explicit-pk-rows (when (and complete-rows
                                    (= (set pks) (into #{} (map pk-fn) complete-rows)))
                           complete-rows)
        single-row       (when (and (= 1 (count pks)) (= 1 (count row-literals)))
                           (merge (first row-literals) (pk->row pk-keys (first pks))))]
    (cond
      ;; Each returned primary key is already the complete captured row; no association is needed.
      pk-only?         (mapv #(pk->row pk-keys %) pks)
      ;; Explicit primary keys make input rows self-identifying; set equality rejects rewrites/defaults.
      explicit-pk-rows explicit-pk-rows
      ;; A single generated key has only one possible input row, so result ordering is irrelevant.
      (and single-row (complete-literal-row? single-row fields non-pk-fields))
      [(select-keys single-row fields)]
      ;; Generated keys plus non-PK fields cannot be correlated portably from JDBC result order.
      :else            (rows-by-pks model fields pks))))

(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/delete.* #_model ::captured #_resolved-query :default]
  "Capture the pre-image of the rows a DELETE statement matches, then deliver one `:delete` event."
  [rf query-type model parsed-args resolved-query]
  (let [fields (capture-fields model :delete)]
    (if (empty? fields)
      (next-method rf query-type model parsed-args resolved-query)
      (let [rows (pre-image-rows :toucan.query-type/select.instances
                                 model fields parsed-args resolved-query)]
        (u/prog1 (next-method rf query-type model parsed-args resolved-query)
          (when (seq rows)
            (deliver-captured! model {:op :delete, :model model, :rows rows})))))))

(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/update.* #_model ::captured #_resolved-query :default]
  "Capture the pre-image of the rows an UPDATE statement matches, then deliver one `:update` event."
  [rf query-type model parsed-args resolved-query]
  (let [fields (when-not (::captured? parsed-args)
                 (capture-fields model :update))]
    (if (or (empty? fields) (empty? (:changes parsed-args)))
      (next-method rf query-type model parsed-args resolved-query)
      ;; The conditions of an update are a conditions map, not a HoneySQL query, hence `from-update`.
      (let [rows (pre-image-rows :toucan.query-type/select.instances.from-update
                                 model fields parsed-args resolved-query)]
        (u/prog1 (next-method rf query-type model (assoc parsed-args ::captured? true) resolved-query)
          (when (seq rows)
            (deliver-captured! model {:op      :update
                                      :model   model
                                      :rows    rows
                                      :changes (:changes parsed-args)})))))))

(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/insert.* #_model ::captured #_resolved-query :default]
  "Capture the generated pks of an INSERT statement, then deliver one `:insert` event.
  Count-returning inserts are upgraded to pk-returning ones (the same upgrade `after-insert` rides), and pk-
  and instance-returning inserts are captured from their own result stream."
  [rf query-type model parsed-args resolved-query]
  (let [capture? (and (not (::captured? parsed-args))
                      (seq (capture-fields model :insert)))]
    (if-not capture?
      (next-method rf query-type model parsed-args resolved-query)
      ;; Toucan already transacts every DML statement. Extend that same boundary through the optional backfill so a
      ;; backfill failure cannot escape after an autocommit insert has already persisted.
      (t2.conn/with-transaction [_]
        (let [pks         (volatile! (transient []))
              parsed-args (assoc parsed-args ::captured? true)
              pks-fn      (t2.model/select-pks-fn model)
              result      (cond
                            ;; already streaming instances: tee pks off the realized rows
                            (isa? query-type :toucan.result-type/instances)
                            (next-method ((map (fn [row]
                                                 (let [row (t2.realize/realize row)]
                                                   (vswap! pks conj! (pks-fn row))
                                                   row)))
                                          rf)
                                         query-type model parsed-args resolved-query)

                            ;; already streaming pks: tee them
                            (isa? query-type :toucan.result-type/pks)
                            (next-method ((map (fn [pk]
                                                 (vswap! pks conj! pk)
                                                 pk))
                                          rf)
                                         query-type model parsed-args resolved-query)

                            ;; update-count: re-dispatch as a pk-returning insert, converting each returned pk
                            ;; back into a count of 1 for the original reducing function
                            :else
                            (t2.pipeline/transduce-query
                             ((map (fn [pk]
                                     (vswap! pks conj! pk)
                                     1))
                              rf)
                             (t2.types/similar-query-type-returning query-type :toucan.result-type/pks)
                             model parsed-args resolved-query))
              pks         (persistent! @pks)]
          (when (seq pks)
            (let [fields       (vec (distinct (concat (t2.model/primary-keys model)
                                                      (capture-fields model :insert))))
                  rows         (insert-rows model fields (:rows parsed-args) pks)
                  captured-pks (when rows (into #{} (map (t2.model/select-pks-fn model)) rows))]
              (if (= (set pks) captured-pks)
                (deliver-captured! model {:op :insert, :model model, :rows rows, :pks pks})
                (log/errorf "Skipping insert capture for %s: could not correlate returned primary keys" model))))
          result)))))

;;; A model may mix capture with toucan2's row-level tools; methodical needs to be told the capture method is
;;; the innermost of the pack, i.e. closest to the statement actually executing. In particular running inside
;;; `before-update` means capture sees the statement as rewritten (final `:changes`, one event per rewrite
;;; group). The `after` tools re-dispatch an upgraded query rather than call `next-method`, so the capture
;;; method guards against re-entry with `::captured?` in `parsed-args`.
;;;
;;; TODO (Chris 2026-07-22) -- this namespace's eventual home is a toucan2 tool. It is pure toucan2
;;; machinery, and its hardest-won content is composition knowledge about toucan2 internals: the prefers
;;; below reference other tools' semi-private dispatch keywords, and a tool-dispatch refactor upstream would
;;; break them here silently, whereas toucan2's own test suite could own that contract (the scratch-model
;;; tests port almost verbatim). Upstream could also replace [[pre-image-rows]]'s compile-then-execute-
;;; modelless workaround with a proper decoration-free query type — a select.raw sibling of
;;; `:toucan.query-type/select.instances-from-pks`, skipped by after-select and transforms. Incubating here
;;; first: the contract is new, and its sharp edges (modelless execution, insert backfill, at-least-once
;;; delivery) should survive production contact before being frozen behind a library release cadence.

(methodical/prefer-method! #'t2.pipeline/transduce-query
                           [:toucan.query-type/delete.* :toucan2.tools.before-delete/before-delete :default]
                           [:toucan.query-type/delete.* ::captured :default])

(methodical/prefer-method! #'t2.pipeline/transduce-query
                           [:toucan.query-type/update.* :toucan2.tools.before-update/before-update :default]
                           [:toucan.query-type/update.* ::captured :default])

(methodical/prefer-method! #'t2.pipeline/transduce-query
                           [:toucan2.tools.after/query-type :toucan2.tools.after/model :default]
                           [:toucan.query-type/update.* ::captured :default])

(methodical/prefer-method! #'t2.pipeline/transduce-query
                           [:toucan2.tools.after/query-type :toucan2.tools.after/model :default]
                           [:toucan.query-type/insert.* ::captured :default])
