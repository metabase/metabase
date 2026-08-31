(ns metabase.test.data.dataset-store.snowflake
  "Snowflake implementation of [[metabase.test.data.dataset-store/DatasetStore]].

  A dataset is a Snowflake DATABASE named by its dataset id. Claims and use timestamps live in a
  tracking table in a separate database, so they are visible to every process reaching this account
  and survive the death of any one of them.

  Atomicity rests on Snowflake serializing UPDATE, DELETE, and MERGE against a single table: a
  concurrent MERGE blocks and then observes the committed result of the one before it, so the row
  count a MERGE reports is a reliable answer to \"did I take the claim?\". Snowflake enforces no
  uniqueness constraint, so every write that must be exclusive goes through MERGE, never a bare
  INSERT."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.snowflake :as snowflake.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private default-tracking-db
  "Deliberately not the tracking database used by the older dataset scheme: the schema here differs,
  and the two must be able to coexist on one account."
  "metabase_dataset_store")

(def ^:private default-lease-seconds
  "How long a claim is honoured without being renewed. Materializing a dataset is usually well under
  a minute; a lease long enough to cover the slow tail would leave a dataset unavailable for that
  long after a caller dies."
  300)

(defonce ^:private claim-owner
  (str (random-uuid)))

;;; ------------------------------------------------ SQL ------------------------------------------------

(def ^:private expired-claim
  "Predicate identifying a claim whose lease has run out. Shared by claim acquisition for creation
  and for deletion so the two cannot disagree about what expiry means."
  "d.claimed_at < DATEADD(second, ?, CURRENT_TIMESTAMP())")

(defn- table-name [tracking-db]
  (str tracking-db ".PUBLIC.datasets"))

(defn- ->timestamp ^java.sql.Timestamp [inst]
  (cond
    (instance? Instant inst)             (java.sql.Timestamp/from ^Instant inst)
    (instance? java.util.Date inst)      (java.sql.Timestamp. (.getTime ^java.util.Date inst))
    :else                                inst))

(defn- create-tracking-table! [spec tracking-db]
  (jdbc/execute! spec [(format "CREATE DATABASE IF NOT EXISTS %s" tracking-db)])
  (jdbc/execute! spec [(format (str "CREATE TABLE IF NOT EXISTS %s ("
                                    " id TEXT NOT NULL,"
                                    " state TEXT NOT NULL,"
                                    " claim_owner TEXT,"
                                    " claimed_at TIMESTAMP_TZ,"
                                    " created_at TIMESTAMP_TZ NOT NULL,"
                                    " last_used_at TIMESTAMP_TZ NOT NULL)")
                               (table-name tracking-db))]))

(defn- row->descriptor [{:keys [id state created_at last_used_at]}]
  {:id           id
   :state        (keyword state)
   :created-at   created_at
   :last-used-at last_used_at})

(defn- select-row [spec tracking-db dataset-id]
  (first (jdbc/query spec [(format "SELECT id, state, created_at, last_used_at FROM %s WHERE id = ?"
                                   (table-name tracking-db))
                           dataset-id])))

(defn- claim-for-create!
  "Take the claim on `dataset-id`, inserting the row if absent or stealing it if its lease expired.
  Returns true if this call now holds the claim."
  [spec tracking-db lease-seconds dataset-id]
  (let [sql (format (str "MERGE INTO %s d"
                         " USING (SELECT ? AS id) s ON d.id = s.id"
                         " WHEN MATCHED AND d.state = 'loading' AND %s"
                         "   THEN UPDATE SET d.claim_owner = ?, d.claimed_at = CURRENT_TIMESTAMP()"
                         " WHEN NOT MATCHED"
                         "   THEN INSERT (id, state, claim_owner, claimed_at, created_at, last_used_at)"
                         "   VALUES (s.id, 'loading', ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())")
                    (table-name tracking-db)
                    expired-claim)]
    (pos? (first (jdbc/execute! spec [sql dataset-id (- lease-seconds) claim-owner claim-owner])))))

(defn- claim-for-delete!
  "Take the claim on `dataset-id` when it is ready, or when a previous claim's lease expired. Never
  inserts: there is nothing to delete if no row exists. Returns true if this call now holds the
  claim."
  [spec tracking-db lease-seconds dataset-id]
  (let [sql (format (str "MERGE INTO %s d"
                         " USING (SELECT ? AS id) s ON d.id = s.id"
                         " WHEN MATCHED AND (d.state = 'ready' OR %s)"
                         "   THEN UPDATE SET d.state = 'loading', d.claim_owner = ?,"
                         "                   d.claimed_at = CURRENT_TIMESTAMP()")
                    (table-name tracking-db)
                    expired-claim)]
    (pos? (first (jdbc/execute! spec [sql dataset-id (- lease-seconds) claim-owner])))))

(defn- mark-ready!
  "Publish `dataset-id`. Returns false if this process no longer holds the claim, which means its
  lease was stolen and whatever it wrote has been superseded."
  [spec tracking-db dataset-id]
  (pos? (first (jdbc/execute! spec [(format (str "UPDATE %s SET state = 'ready', claim_owner = NULL,"
                                                 " claimed_at = NULL, last_used_at = CURRENT_TIMESTAMP()"
                                                 " WHERE id = ? AND claim_owner = ?")
                                            (table-name tracking-db))
                                    dataset-id claim-owner]))))

(defn- release-claim! [spec tracking-db dataset-id]
  (jdbc/execute! spec [(format "DELETE FROM %s WHERE id = ? AND claim_owner = ?" (table-name tracking-db))
                       dataset-id claim-owner]))

(defn- drop-database! [spec dataset-id]
  (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\"" dataset-id)]))

(defn- criteria->where
  "Compile `criteria` into a `[sql-fragment & params]` vector. Every recognized key narrows the
  result; an unrecognized key is ignored rather than silently matching nothing."
  [{:keys [id-prefix state created-before last-used-before used-within-seconds]}]
  (let [clauses (cond-> []
                  ;; STARTSWITH rather than LIKE: dataset ids contain `_`, which LIKE reads as a
                  ;; single-character wildcard.
                  id-prefix        (conj ["STARTSWITH(id, ?)" id-prefix])
                  state            (conj ["state = ?" (name state)])
                  created-before   (conj ["created_at < ?" (->timestamp created-before)])
                  last-used-before (conj ["last_used_at < ?" (->timestamp last-used-before)])
                  ;; A duration, resolved against the warehouse clock -- the only one every caller
                  ;; shares.
                  used-within-seconds (conj ["last_used_at > DATEADD(second, ?, CURRENT_TIMESTAMP())"
                                             (- used-within-seconds)]))]
    (if (empty? clauses)
      [""]
      (into [(str " WHERE " (str/join " AND " (map first clauses)))] (map second) clauses))))

(defn- materialize!
  "Write `dbdef`'s tables into the database named by `dataset-id`.

  Data must be written as UTC or tests break; owned here so no caller has to remember it. The JVM's
  zone and Snowflake's session zone are separate settings and both matter."
  [dataset-id dbdef]
  (snowflake.tx/set-current-user-timezone! "UTC")
  (test.tz/with-system-timezone-id! "UTC"
    (load-data/create-db! :snowflake (assoc dbdef :database-name dataset-id))))

;;; ------------------------------------------------ Store ------------------------------------------------

(defrecord SnowflakeDatasetStore [spec tracking-db lease-seconds setup]
  dataset-store/DatasetStore

  (create-dataset! [_this dataset-id dbdef]
    @setup
    (if (= "ready" (:state (select-row spec tracking-db dataset-id)))
      :exists
      (if-not (claim-for-create! spec tracking-db lease-seconds dataset-id)
        (if (= "ready" (:state (select-row spec tracking-db dataset-id)))
          :exists
          :in-progress)
        (try
          ;; A claim may have been stolen from a caller that died partway through writing, so start
          ;; from nothing rather than trusting whatever it left behind. `create-db!` for this driver
          ;; opens with DROP DATABASE IF EXISTS.
          (materialize! dataset-id dbdef)
          (if (mark-ready! spec tracking-db dataset-id)
            :created
            ;; Lease stolen mid-load: another caller owns this dataset now, so do not claim credit
            ;; for it.
            (if (= "ready" (:state (select-row spec tracking-db dataset-id)))
              :exists
              :in-progress))
          (catch Throwable e
            ;; Give the claim up rather than making the next caller wait out the lease. The database
            ;; goes too: nothing may observe a partially written dataset.
            (log/warnf "[snowflake] failed to materialize %s: %s" dataset-id (ex-message e))
            (drop-database! spec dataset-id)
            (release-claim! spec tracking-db dataset-id)
            (throw e))))))

  (create-temp-isolated-dataset! [_this dbdef]
    @setup
    (let [dataset-id (dataset-store/temp-dataset-id dbdef)]
      ;; The claim always succeeds -- the id was just minted, so no other caller can hold it. Taking
      ;; it anyway is what puts the row in the tracking table, which is how a sweeper finds this
      ;; dataset if its owner dies before deleting it. Snowflake cannot expire a database on its own.
      (claim-for-create! spec tracking-db lease-seconds dataset-id)
      (materialize! dataset-id dbdef)
      (mark-ready! spec tracking-db dataset-id)
      dataset-id))

  (delete-dataset! [_this dataset-id]
    @setup
    (if (claim-for-delete! spec tracking-db lease-seconds dataset-id)
      ;; Claim first, drop second: holding the claim stops another caller from creating this dataset
      ;; between the drop and the row's removal.
      (do
        (drop-database! spec dataset-id)
        (release-claim! spec tracking-db dataset-id)
        :deleted)
      (if (select-row spec tracking-db dataset-id)
        :in-progress
        :absent)))

  (describe-dataset [_this dataset-id]
    @setup
    (some-> (select-row spec tracking-db dataset-id) row->descriptor))

  (list-datasets [_this criteria]
    @setup
    (let [[where & params] (criteria->where criteria)]
      (into []
            (map row->descriptor)
            (jdbc/query spec (into [(format "SELECT id, state, created_at, last_used_at FROM %s%s"
                                            (table-name tracking-db) where)]
                                   params)))))

  (touch-dataset! [_this dataset-id]
    @setup
    (jdbc/execute! spec [(format "UPDATE %s SET last_used_at = CURRENT_TIMESTAMP() WHERE id = ?"
                                 (table-name tracking-db))
                         dataset-id])
    nil))

(defn- server-connection-spec []
  (sql-jdbc.conn/connection-details->spec
   :snowflake
   (tx/dbdef->connection-details :snowflake :server nil)))

;; Creating the tracking table is idempotent and concurrency-safe. It's okay to call from a test context.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn snowflake-dataset-store
  "Build a [[metabase.test.data.dataset-store/DatasetStore]] backed by the Snowflake account named by
  the usual test environment variables.

  Options, all with defaults: `:spec` a JDBC spec reaching the account with no database selected,
  `:tracking-db` the database holding the tracking table, `:lease-seconds` how long a claim is
  honoured unrenewed."
  ([]
   (snowflake-dataset-store {}))
  ([{:keys [spec tracking-db lease-seconds]}]
   (let [spec        (or spec (server-connection-spec))
         tracking-db (or tracking-db default-tracking-db)]
     (->SnowflakeDatasetStore spec
                              tracking-db
                              (or lease-seconds default-lease-seconds)
                              ;; Delayed so building a store costs no round trip, and so the DDL runs
                              ;; once per store rather than once per operation.
                              (delay (create-tracking-table! spec tracking-db))))))
