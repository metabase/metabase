(ns metabase.app-db.db
  "Application database queries for the app-db module: the generic query, batched-write and upsert helpers that
  [[metabase.app-db.core]] re-exports, the Liquibase bookkeeping, and the encryption and setting storage. Every function
  here runs its query through Toucan 2, so no other namespace in the module runs a query itself -- except the custom
  migrations, which keep their own, frozen at the version they shipped in. Every setting write is a plain `t2/query`
  rather than a Toucan DML statement: the cloud-migration guard on Toucan DML reads `read-only-mode` through the
  Setting model first, and while rows are being re-encrypted a setting row can be plaintext under a key, or ciphertext
  under a key not yet in effect, which that model's strict read rejects."
  (:require
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.format :as app-db.format]
   [metabase.app-db.query :as mdb.query]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.jdbc.options :as t2.jdbc.options])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Queries -----------------------------------------------------

(defn query
  "Replacement for [[toucan.db/query]] -- uses Honey SQL 2 instead of Honey SQL 1, to ease the transition to the
  former (and to Toucan 2).

  Query the application database and return all results at once."
  [sql-args-or-honey-sql-map & {:as jdbc-options}]
  (let [sql-args (mdb.query/compile sql-args-or-honey-sql-map)]
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
   (let [compiled (mdb.query/compile sql-args-or-honey-sql-map)]
     (streaming-reducible (fn [conn] (t2/reducible-query conn compiled)) fetch-size))))

;;; ------------------------------------------------- Batched reads --------------------------------------------------

(defn select-partitions
  "The partitions of `xs` of at most [[mdb.query/select-partition-size]], each a vector, for a read that takes them one
  by one."
  [xs]
  (map vec (partition-all mdb.query/select-partition-size xs)))

(defn select-batched
  "The rows `select-fn` returns for each partition of the distinct `ids` of at most
  [[mdb.query/select-partition-size]], in one vector."
  [select-fn ids]
  (into [] (mapcat (comp select-fn vec)) (partition-all mdb.query/select-partition-size (sequence (distinct) ids))))

(defn select-batched-by-keys
  "The rows `select-fn` returns for the map `m`, with the collection under each of its keys `ks` bound in partitions of
  at most [[mdb.query/select-partition-size]], in one vector."
  [select-fn m ks]
  (if-let [[k & more] (seq ks)]
    (if-let [values (seq (get m k))]
      (select-batched #(select-batched-by-keys select-fn (assoc m k (set %)) more) values)
      (recur select-fn m more))
    (select-fn m)))

(defn select-batched-map
  "The entries of the maps `select-fn` returns for each partition of `ids`, as [[select-batched]] reads them, in one
  map."
  [select-fn ids]
  (into {} (select-batched select-fn ids)))

(defn select-batched-set
  "The elements `select-fn` returns for each partition of `ids`, as [[select-batched]] reads them, in one set, nil when
  there are none, as Toucan's set selects answer."
  [select-fn ids]
  (not-empty (into #{} (select-batched select-fn ids))))

(defn select-batched-reducible
  "A reducible over the rows of the reducible `select-fn` returns for each partition of the distinct `ids`."
  [select-fn ids]
  (eduction (mapcat (comp select-fn vec)) (partition-all mdb.query/select-partition-size (sequence (distinct) ids))))

;;; ------------------------------------------------- Batched writes -------------------------------------------------

(defn sum-batched
  "The sum of the row counts `write-fn` returns for each partition of the distinct `ids` of at most `partition-size`."
  [partition-size write-fn ids]
  (transduce (map (comp write-fn vec)) + 0 (partition-all partition-size (sequence (distinct) ids))))

(defn- grouped-updates
  "The `[changes pks]` pairs of `updates`, in the order the changes first appear.
  The primary key of a row is `(pk-fn row)`, and its columns to change are `(changes-fn row)`.
  The rows of one primary key merge in order, so the last value of a column wins.
  A key left with no column to change is left out."
  [updates pk-fn changes-fn]
  (let [pk->changes  (reduce (fn [m row] (update m (pk-fn row) merge (changes-fn row))) {} updates)
        pks          (into [] (comp (map pk-fn) (distinct) (filter (comp seq pk->changes))) updates)
        changes->pks (group-by pk->changes pks)]
    (into [] (comp (map pk->changes) (distinct) (map (juxt identity changes->pks))) pks)))

(defn update-grouped!
  "Apply each of `updates`, the primary key of a row of `model` and the columns to change.
  The rows of one key merge first, so the last value of a column wins.
  The updates run through the model in the order their changes first appear.
  With a one-column primary key, keys that end with the same changes share one update per
  [[mdb.query/update-partition-size]] of them; others update one by one."
  [model updates]
  (let [pk-columns (t2/primary-keys model)]
    (if (= (count pk-columns) 1)
      (let [pk (first pk-columns)]
        (doseq [[changes pks] (grouped-updates updates pk #(dissoc % pk))
                pks           (partition-all mdb.query/update-partition-size pks)]
          (t2/update! model pk [:in [:auto/param (vec pks)]] changes)))
      (doseq [[changes pks] (grouped-updates updates (apply juxt pk-columns) #(apply dissoc % pk-columns))
              pk            pks]
        (t2/update! model :toucan/pk pk changes)))))

(defn insert-returning-instances!
  "Insert the `rows` of `model` with one statement for each set of columns they have, and return the new instances in
  the order of `rows`, read back through [[select-batched]]; Toucan's function of this name returns them in any
  order."
  [model rows]
  (if (empty? rows)
    []
    (let [pks     (u/map-by-key-set #(t2/insert-returning-pks! model %) rows)
          columns (t2/primary-keys model)
          pk-of   (if (= 1 (count columns)) (first columns) (apply juxt columns))
          by-pk   (u/index-by pk-of (select-batched #(t2/select model :toucan/pk [:in %]) pks))]
      (mapv by-pk pks))))

(defn- check-batched-opts
  "Throw when `opts` of a batched write has a key that is none of `known`."
  [opts known]
  (when-let [unknown (seq (remove known (keys opts)))]
    (throw (ex-info (format "Unknown options of a batched write: %s" (pr-str (vec unknown)))
                    {:unknown (vec unknown), :known known}))))

(defn create-batched!
  "Insert `rows` of `model` in batches in one transaction and return the inserted rows: `before-create` gets each batch
  before its insert, throws when it cannot be inserted and returns the rows to insert, or nil for the batch as given,
  and `after-create` gets every inserted row once."
  [model rows {:keys [before-create after-create] :as opts}]
  (check-batched-opts opts #{:before-create :after-create})
  (t2/with-transaction [_conn]
    (let [created (into []
                        (mapcat (fn [batch]
                                  (let [batch (vec batch)]
                                    (insert-returning-instances! model (or (when before-create (before-create batch))
                                                                           batch)))))
                        (partition-all mdb.query/create-partition-size rows))]
      (when (and after-create (seq created))
        (after-create created))
      created)))

(defn- update-batch!
  "Update one batch of `updates` of `model` by `pk` and return the updates written with the rows by primary key as
  stored before and, with `reread?`, after."
  [model pk updates {:keys [before-update reread?]}]
  (let [pks        (mapv pk updates)
        id->stored (t2/select-pk->fn identity model pk [:in [:auto/param pks]])
        updates    (or (when before-update (before-update updates id->stored))
                       updates)]
    (update-grouped! model updates)
    {:updates     updates
     :id->stored  id->stored
     :id->updated (when reread?
                    (t2/select-pk->fn identity model pk [:in [:auto/param pks]]))}))

(defn update-batched!
  "Apply `updates`, each the primary key of a row of `model` and the columns to change, in batches in one transaction:
  `before-update` gets each batch with its rows by primary key as stored, throws when it cannot be applied and returns
  the updates to write, or nil for the batch as given, and `after-update` gets every update written and the rows by
  primary key as stored before and, with `reread?`, after, once, when any of the rows exists."
  [model updates {:keys [after-update reread?] :as opts}]
  (check-batched-opts opts #{:before-update :after-update :reread?})
  (let [pk (first (t2/primary-keys model))]
    (t2/with-transaction [_conn]
      (let [batches (mapv #(update-batch! model pk (vec %) opts)
                          (partition-all mdb.query/update-partition-size updates))]
        (when (and after-update (some (comp seq :id->stored) batches))
          (after-update (into [] (mapcat :updates) batches)
                        (into {} (map :id->stored) batches)
                        (when reread?
                          (into {} (map :id->updated) batches))))))
    nil))

(defn delete-batched!
  "Delete the rows of `model` with `pks` in batches in one transaction: `before-delete` gets every row once before the
  first statement and throws when they cannot be deleted, and `after-delete` gets them once after the last, the rows
  being read only when one of the two is given."
  [model pks {:keys [before-delete after-delete] :as opts}]
  (check-batched-opts opts #{:before-delete :after-delete})
  (let [pk (first (t2/primary-keys model))]
    (t2/with-transaction [_conn]
      (let [batches (mapv vec (partition-all mdb.query/delete-partition-size pks))
            rows    (when (or before-delete after-delete)
                      (into [] (mapcat #(t2/select model pk [:in [:auto/param %]])) batches))]
        (when (or (nil? rows) (seq rows))
          (when before-delete
            (before-delete rows))
          (run! #(t2/delete! model pk [:in [:auto/param %]]) batches)
          (when after-delete
            (after-delete rows)))))
    nil))

;;; ------------------------------------------------ Insert or update ------------------------------------------------

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
    (mdb.query/with-conflict-retry
      (or (apply t2/select-one model select-kvs)
          ;; Wrap INSERT in a savepoint — see comment in [[update-or-insert!]].
          (t2/with-transaction [_conn]
            (t2/insert-returning-instance! model (insert-fn)))))))

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
    (mdb.query/with-conflict-retry
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
        ;; in [[mdb.query/with-conflict-retry]].
        (t2/with-transaction [_conn]
          (t2/insert-returning-pk! model (update-fn nil)))))))

;;; ---------------------------------------------- Counters and pruning ----------------------------------------------

(mu/defn increment-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to `column` of the rows of `model` with `ids`, in one raw
  statement for each [[mdb.query/update-partition-size]] of them that runs no hook and publishes no event, for a usage
  counter no rule reads, returning the number updated."
  [model      :- :keyword
   column     :- :keyword
   count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (transduce
   (map (fn [pairs]
          (let [count->ids (update-vals (group-by first pairs) #(mapv second %))]
            #_{:clj-kondo/ignore [:metabase/change-log-raw-write]} ; the change log leaves out usage stats
            (first (t2/query {:update (t2/table-name model)
                              :set    {column [:+ column (into [:case]
                                                               (mapcat (fn [[cnt ids]]
                                                                         [[:in :id ids] cnt])
                                                                       count->ids))]}
                              :where  [:in :id (mapv second pairs)]})))))
   +
   0
   (partition-all mdb.query/update-partition-size (for [[cnt ids] count->ids, id ids] [cnt id]))))

(mu/defn delete-oldest-rows! :- [:maybe :int]
  "Delete up to `batch-size` of the rows of `model` whose `time-column` is at or before `cutoff`, lowest ids first
  where the database can say so, in one raw statement that runs no hook, for a log table a retention policy trims,
  returning the number deleted."
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

;;; ---------------------------------------------- Liquibase changelog -----------------------------------------------

(defn- write!
  "Run the write `statement` on the Liquibase connection `conn` in a transaction of its own, which commits it even though Liquibase turns autocommit off."
  [conn statement]
  (t2/with-transaction [tx-conn conn]
    (t2/query tx-conn statement)))

(def ^:private JdbcConnection
  (ms/InstanceOfClass Connection))

(def ^:private HoneySqlStatement
  [:fn {:description "a Honey SQL statement"} map?])

(mu/defn changelog-by-id
  "The Liquibase changelog row with `changelog-id` in the app DB of type `db-type`, or nil."
  [db-type      :- [:enum :h2 :mysql :postgres]
   changelog-id :- :string]
  (t2/query-one {:select [:*]
                 :from   [(case db-type
                            (:postgres :h2) :databasechangelog
                            :mysql          :DATABASECHANGELOG)]
                 :where  [:= :id changelog-id]}))

(mu/defn newest-changelog-row
  "The id, filename and deployment id of the newest row of the `changelog` table on `conn` by execution position, or
  nil."
  [conn      :- JdbcConnection
   changelog :- :keyword]
  ;; `orderexecuted` breaks ties between rows sharing a `dateexecuted` (e.g. MySQL second precision)
  (first (t2/query conn {:select   [:id :filename :deployment_id]
                         :from     [changelog]
                         :order-by [[:dateexecuted :desc] [:orderexecuted :desc]]
                         :limit    [:inline 1]})))

(mu/defn changelog-rows
  "The identity, deployment, execution position and exectype of every row of the `changelog` table on `conn`."
  [conn      :- JdbcConnection
   changelog :- :keyword]
  (t2/query conn {:select [:id :author :filename :deployment_id :dateexecuted :orderexecuted :exectype]
                  :from   [changelog]}))

(mu/defn versioned-changelog-rows
  "The id, filename and execution position of every row of the `changelog` table on `conn` with a `vNN.` id."
  [conn      :- JdbcConnection
   changelog :- :keyword]
  (t2/query conn {:select [:id :filename :dateexecuted :orderexecuted]
                  :from   [changelog]
                  :where  [:like :id "v%"]}))

(mu/defn highest-versioned-changeset-id
  "The highest `vNN.` id in the `changelog` table on `conn`, or nil."
  [conn      :- JdbcConnection
   changelog :- :keyword]
  (-> (t2/query conn {:select   [:id]
                      :from     [changelog]
                      :where    [:like :id "v%"]
                      :order-by [[:id :desc]]
                      :limit    [:inline 1]})
      first
      :id))

(mu/defn changelog-rows-at-newest-date
  "The id and deployment id of the rows of the `changelog` table on `conn` with the newest `dateexecuted`."
  [conn      :- JdbcConnection
   changelog :- :keyword]
  (t2/query conn {:select [:id :deployment_id]
                  :from   [changelog]
                  :where  [:= :dateexecuted ^:allow-subquery {:select [[[:max :dateexecuted]]] :from [changelog]}]}))

(mu/defn changelog-rows-with-filename
  "The id and deployment id of the rows of the `changelog` table on `conn` whose filename is `filename`."
  [conn      :- JdbcConnection
   changelog :- :keyword
   filename  :- :string]
  (t2/query conn {:select [:id :deployment_id]
                  :from   [changelog]
                  :where  [:= :filename filename]}))

(mu/defn deployment-changelog-rows
  "The id and filename of the rows of the `changelog` table on `conn` of deployment `deployment-id`."
  [conn          :- JdbcConnection
   changelog     :- :keyword
   deployment-id :- :string]
  (t2/query conn {:select [:id :filename]
                  :from   [changelog]
                  :where  [:= :deployment_id deployment-id]}))

(mu/defn changelog-ids-of-majors-or-deployments
  "The ids of the rows of the `changelog` table on `conn` with a `vNN.` id of one of `majors` or run, not re-run, by one
  of `deployment-ids`, in execution order, or an empty vector when both are empty."
  [conn           :- JdbcConnection
   changelog      :- :keyword
   majors         :- [:sequential :int]
   deployment-ids :- [:sequential :string]]
  (let [clauses (concat (map (fn [major] [:like :id (format "v%d.%%" major)]) majors)
                        (when (seq deployment-ids)
                          [[:and [:in :deployment_id deployment-ids] [:<> :exectype "RERAN"]]]))]
    (if (empty? clauses)
      []
      (mapv :id (t2/query conn {:select   [:id]
                                :from     [changelog]
                                :where    (into [:or] clauses)
                                :order-by [[:dateexecuted :asc] [:orderexecuted :asc]]})))))

(mu/defn changelog-row-exectype
  "The exectype of the row of the `changelog` table on `conn` for the changeset `[filename author id]`, as a map, or nil
  when it has none."
  [conn      :- JdbcConnection
   changelog :- :keyword
   filename  :- :string
   author    :- :string
   id        :- :string]
  (first (t2/query conn {:select [:exectype]
                         :from   [changelog]
                         :where  [:and [:= :id id] [:= :author author] [:= :filename filename]]})))

(mu/defn unversioned-changelog-rows-in-files
  "The id and author of the rows of the `changelog` table on `conn` in one of `filenames` whose id is not a `vNN.` one."
  [conn      :- JdbcConnection
   changelog :- :keyword
   filenames :- [:sequential :string]]
  (t2/query conn {:select [:id :author]
                  :from   [changelog]
                  :where  [:and
                           [:in :filename filenames]
                           [:not-like :id "v%"]]}))

(mu/defn update-changelog-filename!
  "Set the filename of the row of the `changelog` table on `conn` with `id` and `author` to `filename`."
  [conn      :- JdbcConnection
   changelog :- :keyword
   id        :- :string
   author    :- :string
   filename  :- :string]
  (write! conn {:update changelog
                :set    {:filename filename}
                :where  [:and [:= :id id] [:= :author author]]}))

(mu/defn consolidate-changelog-filenames!
  "Point every row of the `changelog` table on `conn` outside a year directory at `legacy-file` or `update-file` by its
  id, as the consolidated changelog files define them."
  [conn        :- JdbcConnection
   changelog   :- :keyword
   legacy-file :- :string
   update-file :- :string]
  (write! conn {:update changelog
                :set    {:filename [:case
                                    [:= :id "v00.00-000"]              update-file
                                    [:< :id "v45.00-001"]              legacy-file
                                    [:< :id "v56.0000-00-00T00:00:00"] update-file
                                    :else                              :filename]}
                :where  [:not-like :filename "%/____/%"]}))

(mu/defn execute-statement!
  "Run the bookkeeping statement `honeysql`, built for `migrate print` to render as well, on `conn`."
  [conn     :- JdbcConnection
   honeysql :- HoneySqlStatement]
  (write! conn honeysql))

(mu/defn execute-ddl!
  "Run `ddl` on `conn` as it is and in no transaction of its own, whose rollback on failure would also discard the
  caller's savepoint."
  [conn :- JdbcConnection
   ddl  :- :string]
  (write! conn [ddl]))

;;; ------------------------------------------------ Version tracking ------------------------------------------------

(mu/defn ran-version
  "The version recorded in the `versions` table on `conn` as having run `deployment-id`, or nil when it has no such
  row."
  [conn          :- JdbcConnection
   versions      :- :keyword
   deployment-id :- :string]
  (-> (t2/query conn {:select   [:metabase_version]
                      :from     [versions]
                      :where    [:and [:= :deployment_id deployment-id] [:= :ran_migrations [:inline true]]]
                      :order-by [:id]
                      :limit    [:inline 1]})
      first
      :metabase_version))

(mu/defn version-rows
  "The deployment id, version and ran flag of every row of the `versions` table on `conn`, in id order."
  [conn     :- JdbcConnection
   versions :- :keyword]
  (t2/query conn {:select   [:deployment_id :metabase_version :ran_migrations]
                  :from     [versions]
                  :order-by [:id]}))

(mu/defn deployment-version-rows
  "The id and version of the rows of the `versions` table on `conn` of deployment `deployment-id`."
  [conn          :- JdbcConnection
   versions      :- :keyword
   deployment-id :- :string]
  (t2/query conn {:select [:id :metabase_version]
                  :from   [versions]
                  :where  [:= :deployment_id deployment-id]}))

(mu/defn version-row-exists?
  "Whether the `versions` table on `conn` has a row for `deployment-id` and `version`."
  [conn          :- JdbcConnection
   versions      :- :keyword
   deployment-id :- :string
   version       :- :string]
  (boolean (seq (t2/query conn {:select [[[:inline 1] :one]]
                                :from   [versions]
                                :where  [:and [:= :deployment_id deployment-id] [:= :metabase_version version]]}))))

(mu/defn delete-version-row!
  "Delete the row of the `versions` table on `conn` with `id`."
  [conn     :- JdbcConnection
   versions :- :keyword
   id       :- :int]
  (write! conn {:delete-from versions :where [:= :id id]}))

(mu/defn delete-versions-of-emptied-deployments!
  "Delete the rows of the `versions` table on `conn` whose deployment has no row in the `changelog` table, nor in the
  `first-runs` table when one is given."
  [conn       :- JdbcConnection
   versions   :- :keyword
   changelog  :- :keyword
   first-runs :- [:maybe :keyword]]
  (let [deployment-id   (u/qualified-key versions :deployment_id)
        not-recorded-in (fn [table]
                          [:not [:exists ^:allow-subquery {:select [[[:inline 1] :one]]
                                                           :from   [[table :other]]
                                                           :where  [:= :other.deployment_id deployment-id]}]])]
    (write! conn {:delete-from versions
                  :where       (cond-> [:and [:<> deployment-id nil] (not-recorded-in changelog)]
                                 first-runs (conj (not-recorded-in first-runs)))})))

;;; --------------------------------------------------- First runs ---------------------------------------------------

(mu/defn first-run-rows
  "Every row of the `first-runs` table on `conn`."
  [conn       :- JdbcConnection
   first-runs :- :keyword]
  (t2/query conn {:select [:changeset_id :author :filename :deployment_id :dateexecuted :orderexecuted]
                  :from   [first-runs]}))

(mu/defn first-run-recorded?
  "Whether the `first-runs` table on `conn` has a row for the changeset `[filename author id]`."
  [conn       :- JdbcConnection
   first-runs :- :keyword
   filename   :- :string
   author     :- :string
   id         :- :string]
  (boolean (seq (t2/query conn {:select [[[:inline 1] :one]]
                                :from   [first-runs]
                                :where  [:and [:= :changeset_id id] [:= :author author] [:= :filename filename]]}))))

(mu/defn delete-first-run!
  "Delete the row of the `first-runs` table on `conn` for the changeset `[filename author id]`."
  [conn       :- JdbcConnection
   first-runs :- :keyword
   filename   :- :string
   author     :- :string
   id         :- :string]
  (write! conn {:delete-from first-runs
                :where       [:and [:= :changeset_id id] [:= :author author] [:= :filename filename]]}))

;;; ---------------------------------------------------- Rollback ----------------------------------------------------

(mu/defn reassign-changelog-row!
  "Move the row of the `changelog` table on `conn` for the changeset `[filename author id]` onto `deployment-id`."
  [conn          :- JdbcConnection
   changelog     :- :keyword
   filename      :- :string
   author        :- :string
   id            :- :string
   deployment-id :- :string]
  (write! conn {:update changelog
                :set    {:deployment_id deployment-id}
                :where  [:and [:= :filename filename] [:= :author author] [:= :id id]]}))

(mu/defn delete-deployment-rows!
  "Delete the rows of `table` on `conn` of the deployments `deployment-ids`."
  [conn           :- JdbcConnection
   table          :- :keyword
   deployment-ids :- [:set :string]]
  (write! conn {:delete-from table :where [:in :deployment_id deployment-ids]}))

;;; ---------------------------------------------------- Settings ----------------------------------------------------

(mu/defn current-timestamp-string
  "The application DB's own current timestamp, as a string, for app DB type `db-type`."
  ^String [db-type :- [:enum :h2 :mysql :postgres]]
  ;; for MySQL, cast(current_timestamp AS char); for H2 & Postgres, cast(current_timestamp AS text)
  (let [cast-form (h2x/cast (if (= db-type :mysql) :char :text) (h2x/current-datetime-honeysql-form db-type))]
    (:timestamp (t2/query-one {:select [[cast-form :timestamp]]}))))

(def ^:private unmigrated-settings-where
  [:and [:= :value_with_aad nil] [:not= :value nil] [:not= :value ""]])

(mu/defn setting-value
  "The legacy `value` of the setting row with `setting-key`, or nil."
  [setting-key :- :string]
  (t2/select-one-fn :value (t2/table-name :model/Setting) :key setting-key))

(mu/defn settings
  "Every setting row, raw."
  []
  (t2/select (t2/table-name :model/Setting)))

(mu/defn reducible-setting-values-with-aad
  "A reducible of the key and `value_with_aad` of every setting row that has one."
  []
  (t2/reducible-select [(t2/table-name :model/Setting) :key :value_with_aad] {:where [:!= :value_with_aad nil]}))

(mu/defn unmigrated-settings?
  "Whether any setting row has a non-blank `value` but no `value_with_aad`."
  []
  (t2/exists? (t2/table-name :model/Setting) {:where unmigrated-settings-where}))

(mu/defn unmigrated-settings
  "Every setting row with a non-blank `value` but no `value_with_aad`, locked for update."
  []
  (t2/select (t2/table-name :model/Setting) {:where unmigrated-settings-where, :for :update}))

(mu/defn insert-setting!
  "Insert a setting row for `setting-key` holding `value` and `value-with-aad`, returning the number inserted (as a
  one-element sequence -- `t2/query` on an INSERT, unlike `t2/insert!`, does not unwrap it)."
  [setting-key    :- :string
   value          :- [:maybe :string]
   value-with-aad :- [:maybe :string]]
  (t2/query {:insert-into (t2/table-name :model/Setting)
             :values      [{:key setting-key, :value value, :value_with_aad value-with-aad}]}))

(mu/defn update-setting-values!
  "Set the columns in `changes` -- `:value` and/or `:value_with_aad`, nil writing NULL -- of the setting row with
  `setting-key`, returning the number updated (as a one-element sequence -- `t2/query` on an UPDATE, unlike
  `t2/update!`, does not unwrap it)."
  [setting-key :- :string
   changes     :- [:map {:closed true}
                   [:value          {:optional true} [:maybe :string]]
                   [:value_with_aad {:optional true} [:maybe :string]]]]
  (t2/query {:update (t2/table-name :model/Setting)
             :set    (select-keys changes [:value :value_with_aad])
             :where  [:= :key setting-key]}))

(mu/defn delete-setting!
  "Delete the setting row with `setting-key`, returning the number deleted (as a one-element sequence -- `t2/query`
  on a DELETE, unlike `t2/delete!`, does not unwrap it)."
  [setting-key :- :string]
  (t2/query {:delete-from (t2/table-name :model/Setting), :where [:= :key setting-key]}))

;;; --------------------------------------------------- Encryption ---------------------------------------------------

(mu/defn reducible-column-values
  "A reducible of the id and `column` value of every row of `table`."
  [table  :- :keyword
   column :- :keyword]
  (t2/reducible-select [table :id [column :value]]))

(mu/defn update-column-value!
  "Set `column` of the row of `table` with `id` to `value`, returning the number updated (as a one-element
  sequence -- `t2/query` on an UPDATE, unlike `t2/update!`, does not unwrap it)."
  [table  :- :keyword
   column :- :keyword
   id     :- ms/PositiveInt
   value  :- [:maybe [:or :string bytes?]]]
  (t2/query {:update table, :set {column value}, :where [:= :id id]}))

(mu/defn delete-query-cache!
  "Delete every cached query result, returning the number deleted (as a one-element sequence -- `t2/query` on a
  DELETE, unlike `t2/delete!`, does not unwrap it)."
  []
  (t2/query {:delete-from (t2/table-name :model/QueryCache)}))
