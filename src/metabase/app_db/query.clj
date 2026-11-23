(ns metabase.app-db.query
  "Honey SQL 2 replacements for [[toucan.db/query]] and [[toucan.db/reducible-query]]. These are here to ease our
  transition to Honey SQL 2 and Toucan 2. Once we switch over to the latter we can hopefully remove this namespace.

  PRO TIPS:

  1. You can enable debug logging for the compiled SQL locally by setting the log level for this namespace to
     `:trace`:

     ```
     (metabase.test/set-ns-log-level! 'metabase.app-db.query :trace)
     ```

  2. If using CIDER, set

     ```
     (setq cider-stacktrace-fill-column nil)
     ```

     So the nicely-formatted SQL in error messages doesn't get wrapped into a big blob in the `*cider-error*` buffer."
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.db :as app-db.db]
   [metabase.app-db.format :as app-db.format]
   [metabase.funnysql.core :as funnysql]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.jdbc.options :as t2.jdbc.options]
   [toucan2.model :as t2.model])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private NamespacedKeyword
  [:and :keyword [:fn (comp seq namespace)]])

(mu/defn type-keyword->descendants :- [:set {:min 1} ms/NonBlankString]
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :Semantic/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword :- NamespacedKeyword]
  (set (map u/qualified-name (cons type-keyword (descendants type-keyword)))))

(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in [[metabase.types.core]].

     (t2/select Field :semantic_type (mdb/isa :type/URL))
      ->
     (t2/select Field :semantic_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional `expr` for use directly in a HoneySQL `where`:

     (t2/select Field {:where (mdb/isa :semantic_type :type/URL)})
     ->
     (t2/select Field {:where [:in :semantic_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (type-keyword->descendants type-keyword)])
  ;; when using this with an `expr` (e.g. `(isa :semantic_type :type/URL)`) just go ahead and take the results of the
  ;; one-arity impl above and splice expr in as the second element
  ;;
  ;;    [:in #{"type/URL" "type/ImageURL"}]
  ;;
  ;; becomes
  ;;
  ;;    [:in :semantic_type #{"type/URL" "type/ImageURL"}]
  ([expr type-keyword]
   [:in expr (type-keyword->descendants type-keyword)]))

(defn qualify
  "Returns a qualified field for [modelable] with [field-name]."
  ^clojure.lang.Keyword [modelable field-name]
  (if (vector? field-name)
    [(qualify modelable (first field-name)) (second field-name)]
    (let [model (t2.model/resolve-model modelable)]
      (keyword (str (name (t2.model/table-name model)) \. (name field-name))))))

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (t2/select-pks-set FieldValues
       (mdb/join [FieldValues :field_id] [Field :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(t2/table-name (t2.model/resolve-model dest-entity))
               [:= (qualify source-entity fk) (qualify dest-entity pk)]]})

(defmulti compile
  "Compile a `query` (e.g. a Honey SQL map) to `[sql & args]`."
  {:arglists '([query])}
  type)

(defmethod compile String
  [sql]
  (compile [sql]))

(defmethod compile clojure.lang.IPersistentVector
  [sql-args]
  sql-args)

(defmethod compile clojure.lang.IPersistentMap
  [honeysql]
  (funnysql/format honeysql (mdb.connection/db-type)))

(defn current-timestamp-string
  "The application DB's own current timestamp, as a string. Read from the DB rather than from this machine's clock,
  for the `settings-last-updated` marker that instances compare against each other."
  ^String [db-type]
  (app-db.db/current-timestamp-string db-type))

;;; TODO -- we should mark this deprecated and tell people to use [[toucan2.core/query]] directly instead
(defn query
  "Replacement for [[toucan.db/query]] -- uses Honey SQL 2 instead of Honey SQL 1, to ease the transition to the
  former (and to Toucan 2).

  Query the application database and return all results at once.

  See namespace documentation for [[metabase.app-db.query]] for pro debugging tips."
  [sql-args-or-honey-sql-map & {:as jdbc-options}]
  (let [sql-args (compile sql-args-or-honey-sql-map)]
    ;; catch errors running the query and rethrow with the failing generated SQL and the failing Honey SQL form -- this
    ;; will help with debugging stuff. This should mostly be dev-facing because we should hopefully not be committing
    ;; any busted code into the repo
    (try
      (binding [t2.jdbc.options/*options* (merge t2.jdbc.options/*options* jdbc-options)]
        (t2/query sql-args))
      (catch Throwable e
        (let [formatted-sql (app-db.format/format-sql (first sql-args))]
          (throw (ex-info (str "Error executing SQL query: " (ex-message e)
                               \newline
                               \newline
                               formatted-sql)
                          {:sql        (str/split-lines (str/trim formatted-sql))
                           :args       (rest sql-args)
                           :uncompiled sql-args-or-honey-sql-map}
                          e)))))))

(defn streaming-reducible
  "Returns a reducible that, when reduced, opens a transaction (autoCommit=false) with a
  fetch-size set to enable server-side cursor streaming on PostgreSQL app databases.

  `make-reducible-fn` is a 1-arg function called with the transaction `java.sql.Connection`.
  Pass it explicitly to `t2/reducible-select` via `:conn` or to `t2/reducible-query` so the
  query runs on the transaction connection — otherwise PostgreSQL ignores fetch-size.

  WARNING: Because this opens a transaction, do not wrap any long-running logic in this which will hold the transaction open too long.

  Example:
    (streaming-reducible
     (fn [conn]
       (eduction (map t2.realize/realize)
                 (t2/reducible-select :conn conn :model/Table :active true))))"
  ([make-reducible-fn]
   (streaming-reducible make-reducible-fn 500))
  ([make-reducible-fn fetch-size]
   (reify clojure.lang.IReduceInit
     (reduce [_ f init]
       (t2/with-transaction [conn]
         (binding [t2.jdbc.options/*options* (merge t2.jdbc.options/*options*
                                                    {:fetch-size fetch-size})]
           (reduce f init (make-reducible-fn conn))))))))

(defn streaming-reducible-query
  "Like `t2/reducible-query` but uses a transaction (autoCommit=false) and a fetch-size
  to enable server-side cursor streaming on PostgreSQL. Returns a reducible of raw maps."
  ([sql-args-or-honey-sql-map]
   (streaming-reducible-query sql-args-or-honey-sql-map 500))
  ([sql-args-or-honey-sql-map fetch-size]
   (let [compiled (compile sql-args-or-honey-sql-map)]
     (streaming-reducible (fn [conn] (t2/reducible-query conn compiled)) fetch-size))))

(defmacro with-conflict-retry
  "Retry a database mutation a single time if it fails due to concurrent insertions.
   May retry for other reasons."
  [& body]
  `(try
     ~@body
     (catch ExceptionInfo e#
       ;; The underlying exception thrown by the driver is database specific and opaque, so we treat any exception as a
       ;; possible database conflict due to a concurrent insert. If we want to be more conservative, we would need
       ;; a per-driver or driver agnostic way to test the exception.
       ~@body)))

(def create-partition-size
  "The number of rows one pass of a create write function takes."
  1000)

(def delete-partition-size
  "The number of ids one DELETE statement of a write function takes, below the parameter limit of every app DB."
  10000)

(def update-partition-size
  "The number of rows one pass of an update write function takes."
  1000)

(defn- grouped-updates
  "The `[changes pks]` pairs of `updates` in the order the changes first appear, where `pk-fn` gives the primary key of
  a row and `changes-fn` its columns to change; rows with no column to change are left out."
  [updates pk-fn changes-fn]
  (let [pks (reduce (fn [m row]
                      (let [changes (changes-fn row)]
                        (cond-> m
                          (seq changes) (update changes (fnil conj []) (pk-fn row)))))
                    {}
                    updates)]
    (into []
          (comp (map changes-fn) (filter seq) (distinct) (map (fn [changes] [changes (pks changes)])))
          updates)))

(defn update-grouped!
  "Apply each of `updates`, the primary key of a row of `model` and the columns to change, with one update through the
  model for the rows that get the same changes, in the order the changes first appear."
  [model updates]
  (let [pk-columns (t2/primary-keys model)]
    (if (= (count pk-columns) 1)
      (let [pk (first pk-columns)]
        (doseq [[changes pks] (grouped-updates updates pk #(dissoc % pk))]
          (t2/update! model pk [:in [:auto/param pks]] changes)))
      (doseq [[changes pks] (grouped-updates updates (apply juxt pk-columns) #(apply dissoc % pk-columns))
              pk            pks]
        (t2/update! model :toucan/pk pk changes)))))

(defn insert-returning-instances!
  "Insert the `rows` of `model` with one statement for each set of columns they have, and return the new instances in
  the order of `rows`, read back with one select; Toucan's function of this name returns them in any order."
  [model rows]
  (if (empty? rows)
    []
    (let [pks     (u/map-by-key-set #(t2/insert-returning-pks! model %) rows)
          columns (t2/primary-keys model)
          pk-of   (if (= 1 (count columns)) (first columns) (apply juxt columns))
          by-pk   (u/index-by pk-of (t2/select model :toucan/pk [:in pks]))]
      (mapv by-pk pks))))

(defn create-batched!
  "Insert `rows` of `model` in batches in one transaction and return the inserted rows: for each batch `check-fn` throws
  when its rows cannot be inserted and `prepare-fn` returns the rows to insert, and `publish-fn` gets every inserted row
  once."
  [model rows {:keys [check-fn prepare-fn publish-fn]}]
  (t2/with-transaction [_conn]
    (let [created (into []
                        (mapcat (fn [batch]
                                  (let [batch (vec batch)]
                                    (when check-fn
                                      (check-fn batch))
                                    (insert-returning-instances! model (cond-> batch prepare-fn prepare-fn)))))
                        (partition-all create-partition-size rows))]
      (when (and publish-fn (seq created))
        (publish-fn created))
      created)))

(defn- update-batch!
  "Update one batch of `updates` of `model` by `pk` and return the updates written with the rows by primary key as
  stored before and, with `reread?`, after."
  [model pk updates {:keys [check-fn prepare-fn reread?]}]
  (let [pks        (mapv pk updates)
        id->stored (t2/select-pk->fn identity model pk [:in [:auto/param pks]])]
    (when check-fn
      (check-fn updates id->stored))
    (let [updates (cond-> updates prepare-fn (prepare-fn id->stored))]
      (update-grouped! model updates)
      {:updates     updates
       :id->stored  id->stored
       :id->updated (when reread?
                      (t2/select-pk->fn identity model pk [:in [:auto/param pks]]))})))

(defn update-batched!
  "Apply `updates`, each the primary key of a row of `model` and the columns to change, in batches in one transaction:
  for each batch `check-fn` throws when its updates cannot be applied to the stored rows by primary key and `prepare-fn`
  returns the updates to write, and `publish-fn` gets every update written and the rows by primary key as stored before
  and, with `reread?`, after, once."
  [model updates {:keys [publish-fn reread?] :as opts}]
  (let [pk (first (t2/primary-keys model))]
    (t2/with-transaction [_conn]
      (let [batches (mapv #(update-batch! model pk (vec %) opts)
                          (partition-all update-partition-size updates))]
        (when (and publish-fn (seq batches))
          (publish-fn (into [] (mapcat :updates) batches)
                      (into {} (map :id->stored) batches)
                      (when reread?
                        (into {} (map :id->updated) batches))))))
    nil))

(defn delete-batched!
  "Delete the rows of `model` with `pks` in batches in one transaction: before the first statement `check-fn` throws
  when the rows cannot be deleted, `cascade-fn` deletes what they own and `publish-fn` gets them, each once with every
  row."
  [model pks {:keys [check-fn cascade-fn publish-fn]}]
  (let [pk (first (t2/primary-keys model))]
    (t2/with-transaction [_conn]
      (let [batches (mapv vec (partition-all delete-partition-size pks))
            rows    (into [] (mapcat #(t2/select model pk [:in [:auto/param %]])) batches)]
        (when (seq rows)
          (when check-fn
            (check-fn rows))
          (when cascade-fn
            (cascade-fn rows))
          (when publish-fn
            (publish-fn rows))
          (run! #(t2/delete! model pk [:in [:auto/param %]]) batches))))
    nil))

(defn select-or-insert!
  "Return a database record if it exists, otherwise create it.

   The `select-map` is used to query the `model`, and if a result is found it is immediately returned.
   If no value is found, `insert-fn` is called to generate the entity to be inserted.

   Note that this generated entity must be consistent with `select-map`, if it disagrees on any keys then an exception
   will be thrown. It is OK for the entity to omit fields from `select-map`, they will implicitly be added on.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and it also allows one to avoid
   calculating initial values that may be expensive, or require side effects.

   In the case where there is an underlying db constraint to prevent duplicates, this method takes care of handling
   rejection from the database due to a concurrent insert, and will retry a single time to pick up the existing row.
   This may result in `insert-fn` being called a second time.

   In the case where there is no underlying db constraint, concurrent calls may still result in duplicates.
   To prevent this in a database agnostic way, during an existing non-serializable transaction, would be non-trivial."
  [model select-map insert-fn]
  (let [select-kvs (mapcat identity select-map)
        insert-fn  #(let [instance (insert-fn)]
                      ;; the inserted values must be consistent with the select query
                      (assert (not (u/conflicting-keys? select-map instance))
                              "this should not be used to change any of the identifying values")
                      ;; for convenience, we allow insert-fn's result to omit fields in the search-map
                      (merge instance select-map))]
    (with-conflict-retry
      (or (apply t2/select-one model select-kvs)
          ;; Wrap INSERT in a savepoint — see comment in [[update-or-insert!]].
          (t2/with-transaction [_conn]
            (t2/insert-returning-instance! model (insert-fn)))))))

(mu/defn increment-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to `column` of the rows of `model` with `ids`, in one raw
  statement that runs no hook and publishes no event, for a usage counter no rule reads. Returns the number updated."
  [model      :- :keyword
   column     :- :keyword
   count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  #_{:clj-kondo/ignore [:metabase/change-log-raw-write]} ; the change log leaves out usage stats
  (first (t2/query {:update (t2/table-name model)
                    :set    {column [:+ column (into [:case]
                                                     (mapcat (fn [[cnt ids]]
                                                               [[:in :id ids] cnt])
                                                             count->ids))]}
                    :where  [:in :id (apply concat (vals count->ids))]})))

(mu/defn delete-oldest-rows! :- [:maybe :int]
  "Delete up to `batch-size` of the rows of `model` whose `time-column` is at or before `cutoff`, lowest ids first
  where the database can say so, in one raw statement that runs no hook, for a log table a retention policy trims.
  Returns the number deleted."
  [model       :- :keyword
   time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (let [table (t2/table-name model)]
    (case (mdb.connection/db-type)
      (:postgres :h2)
      (t2/query-one {:delete-from table
                     :where [:in
                             :id
                             ^:allow-subquery {:select [:id]
                                               :from table
                                               :where [:<= time-column cutoff]
                                               :order-by [[:id :asc]]
                                               :limit batch-size}]})

      :mysql
      (t2/query-one {:delete-from table
                     :where [:<= time-column cutoff]
                     :limit batch-size}))))

(defn update-or-insert!
  "Update a database record, if it exists, otherwise create it.

   The `select-map` is used to query the `model`, and if a result is found then we will update that entity, otherwise
   a new entity will be created. We use `update-fn` to calculate both updates and initial values - in the first case
   it will be called with the existing value, and in the second case it will be called with nil, analogous to the way
   that [[clojure.core/update]] calls its function.

   Note that the generated entity must be consistent with `select-map`, if it disagrees on any keys then an exception
   will be thrown. It is OK for the entity to omit fields from `select-map`, they will implicitly be added on.

   When called with an existing record, `update-fn` may return nil to signal that no update is needed. In this case
   the existing row is left untouched and its primary key is returned. This is useful for \"get-or-create\" patterns.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and it also allows one to avoid
   calculating initial values that may be expensive, or require side effects.

   In the case where there is an underlying db constraint to prevent duplicates, this method takes care of handling
   rejection from the database due to a concurrent insert, and will retry a single time to pick up the existing row.
   This may result in `update-fn` being called a second time.

   In the case where there is no underlying db constraint, concurrent calls may still result in duplicates.
   To prevent this in a database agnostic way, during an existing non-serializable transaction, would be non-trivial."
  [model select-map & [update-fn]]
  (let [update-fn  (or update-fn (constantly select-map))
        select-kvs (mapcat identity select-map)
        pks        (mapv keyword (t2/primary-keys model))
        ;; The "pk" used to address an update and as the return value: a scalar for a single-column key
        ;; (unchanged), a `[v1 v2 ...]` vector for a compound key — matching what `insert-returning-pk!`
        ;; returns and what `t2/update!` accepts for a composite key.
        pk-of      (fn [row] (if (= 1 (count pks)) ((first pks) row) (mapv #(% row) pks)))
        update-fn  (fn [existing]
                     (let [updated (update-fn existing)]
                       ;; When called with an existing record, returning nil signals "no update needed".
                       (when (or updated (not existing))
                         ;; the inserted / updated values must be consistent with the select query
                         (assert (not (u/conflicting-keys? select-map updated))
                                 "This should not be used to change any of the identifying values")
                         ;; For convenience, we allow the update-fn to omit fields in the search-map
                         (merge updated select-map))))]
    (with-conflict-retry
      (if-let [existing (apply t2/select-one model select-kvs)]
        (let [pk (pk-of existing)]
          (if-let [updated (update-fn existing)]
            ;; `model` is any model, so match on its own primary key, which may not be `:id` or may be composite.
            (do (t2/update! model :toucan/pk pk updated)
                ;; the primary key may have been changed by the update, and this is OK.
                (pk-of (merge existing updated)))
            ;; update-fn returned nil — no update needed, return existing pk.
            pk))
        ;; Wrap INSERT in a savepoint so that a constraint violation inside an existing
        ;; PostgreSQL transaction doesn't abort the outer transaction. The savepoint is
        ;; rolled back on failure, keeping the outer transaction usable for the retry
        ;; in [[with-conflict-retry]].
        (t2/with-transaction [_conn]
          (t2/insert-returning-pk! model (update-fn nil)))))))
