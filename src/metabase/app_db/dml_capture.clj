(ns metabase.app-db.dml-capture
  "Statement-level capture of DML executed through Toucan 2.

  A model opts in by deriving from [[hook]] and implementing [[capture-fields]] and [[captured!]].
  Each captured `insert!`/`update!`/`delete!` *statement* then delivers exactly one event describing the
  affected rows, however many there are — unlike the per-row `after-insert`/`after-update` tools, and unlike
  `before-delete`, which realizes every matching row as a full instance.

  Event shape (see [[captured!]]):

    {:op :delete, :model model, :rows [pre-image, ...]}
    {:op :update, :model model, :rows [pre-image, ...], :changes changes}
    {:op :insert, :model model, :rows [row-literal, ...], :pks [pk, ...]}

  For updates and deletes the `:rows` are narrow pre-image snapshots — only the columns named by
  [[capture-fields]], selected with the statement's own conditions immediately before it executes. They are
  plain maps of RAW column values: the select is compiled through the model's pipeline (so conditions behave
  exactly like the statement's) but executed without it, so `after-select` methods, type transforms and other
  instance decorations never run — decorations routinely assume a full row and must not constrain what a
  capture may snapshot. For updates, `:changes` is the statement's changes map: every affected row received
  these same changes, so the post-image of a captured column is
  `(merge pre-image (select-keys changes capture-fields))` whenever its changed value is a literal. Values
  are HoneySQL expressions when the caller passed expressions; they are delivered as-is.

  For inserts `:rows` are the row maps as passed to `insert!` with the generated primary key assoc'd on, and
  `:pks` are the generated primary keys. When some requested capture field is absent from the literals —
  the column is filled in by the database or a `before-insert` method (e.g. `revision.most_recent`) — the
  rows are replaced by one narrow select of the capture fields by pk, so a captured field is always present
  and authoritative either way. Other literal values are delivered as passed, before type transforms.

  Delivery guarantees, and non-guarantees:

  - One event per statement, delivered on the calling thread after the statement executes but before any
    enclosing transaction commits. If the transaction rolls back, the event has already fired: consumers must
    treat events as \"look at these rows again\", never as facts about committed state.
  - A statement matching zero rows delivers no event.
  - DML that bypasses the model — `(t2/delete! (t2/table-name model) ...)`, raw `t2/query` — delivers no
    event, exactly as it bypasses every other Toucan 2 tool.
  - `update!` statements rewritten by a `before-update` method are captured after the rewrite: `:changes` is
    what actually ran, and a before-update that splits one statement into per-row groups delivers one event
    per group."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
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
  Update and delete snapshots are narrowed to exactly these columns; insert rows are the caller's literals,
  back-filled by pk when a requested column is missing from them."
  {:arglists '([model op])}
  (fn [model _op] (keyword model)))

(defmethod capture-fields :default
  [_model _op]
  nil)

(defmulti captured!
  "Deliver a capture event for a DML statement against `model`; see the namespace docstring for the shape.
  Implementations run on the DML's calling thread, inside any enclosing transaction: keep them cheap and
  never let them throw."
  {:arglists '([model event])}
  (fn [model _event] (keyword model)))

(defn- pre-image-rows
  "Select the rows a delete/update statement is about to affect, narrowed to `fields`, as plain raw-value maps.
  The select is built and compiled through the model's pipeline so conditions keep the statement's exact
  semantics, but executed modelless: `after-select` methods and type transforms often dereference columns a
  narrow snapshot doesn't fetch, so no instance decoration may run here.
  Runs on the current connection, so inside any transaction the statement itself runs in.
  Capture is best-effort: a query shape we cannot rebuild as a select (e.g. raw sql-args with kv-args) logs
  and skips capture rather than failing the caller's statement."
  [query-type model fields parsed-args resolved-query]
  (try
    (let [built    (t2.pipeline/build query-type model
                                      (assoc parsed-args :columns (vec fields))
                                      resolved-query)
          sql-args (t2.pipeline/compile query-type model built)]
      (t2.execute/query sql-args))
    (catch Exception e
      (log/errorf e "Skipping DML capture for %s: could not snapshot pre-image rows" model)
      nil)))

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
            (captured! model {:op :delete, :model model, :rows rows})))))))

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
            (captured! model {:op      :update
                              :model   model
                              :rows    rows
                              :changes (:changes parsed-args)})))))))

(methodical/defmethod t2.pipeline/transduce-query
  [#_query-type :toucan.query-type/insert.* #_model ::captured #_resolved-query :default]
  "Capture the generated pks of an INSERT statement, then deliver one `:insert` event.
  Count-returning inserts are upgraded to pk-returning ones (the same upgrade `after-insert` rides), so no
  follow-up SELECT is needed; pk- and instance-returning inserts are captured from their own result stream."
  [rf query-type model parsed-args resolved-query]
  (let [capture? (and (not (::captured? parsed-args))
                      (seq (capture-fields model :insert)))]
    (if-not capture?
      (next-method rf query-type model parsed-args resolved-query)
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
          (let [fields       (capture-fields model :insert)
                row-literals (:rows parsed-args)
                pk-keys      (t2.model/primary-keys model)
                single-pk    (when (= 1 (count pk-keys)) (first pk-keys))
                rows         (if (and single-pk (= (count pks) (count row-literals)))
                               (mapv #(assoc %1 single-pk %2) row-literals pks)
                               (vec row-literals))
                ;; The literals lack a requested capture field when the column is filled in by the database
                ;; or a before-insert method (e.g. revision.most_recent); one narrow select by the returned
                ;; pks recovers the authoritative values.
                complete?    (fn [row] (every? #(contains? row %) fields))
                rows         (if (or (every? complete? rows) (nil? single-pk))
                               rows
                               (pre-image-rows :toucan.query-type/select.instances model
                                               (distinct (cons single-pk fields))
                                               {:kv-args {:toucan/pk [:in pks]}}
                                               {}))]
            (captured! model {:op :insert, :model model, :rows rows, :pks pks})))
        result))))

;;; A model may mix capture with toucan2's row-level tools; methodical needs to be told the capture method is
;;; the innermost of the pack, i.e. closest to the statement actually executing. In particular running inside
;;; `before-update` means capture sees the statement as rewritten (final `:changes`, one event per rewrite
;;; group). The `after` tools re-dispatch an upgraded query rather than call `next-method`, so the capture
;;; method guards against re-entry with `::captured?` in `parsed-args`.

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
