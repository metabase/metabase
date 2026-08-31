(ns metabase.test.data.dataset-store.redshift
  "Redshift implementation of [[metabase.test.data.dataset-store/DatasetStore]].

  Redshift gives every test run one shared database, so a dataset here is a SCHEMA within it named
  by its dataset id. A schema each means a Database's `:schema-filters-patterns` can name exactly
  one, which Redshift pushes into the catalog query, and it makes deletion a single
  `DROP SCHEMA ... CASCADE`. Claims and use timestamps live in a table in a schema of its own,
  visible to every process reaching the cluster.

  Atomicity rests on Redshift running transactions at SERIALIZABLE isolation. Redshift enforces no
  uniqueness constraint and has no portable upsert, so a claim is taken inside a transaction with a
  conditional UPDATE followed by an INSERT guarded by NOT EXISTS. Two processes racing for one
  dataset therefore end with one of them aborted for serialization failure, which reads as losing
  the race rather than as an error."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.redshift :as redshift.tx]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private default-tracking-schema
  "Its own schema, not the one the older scheme sweeps: the columns differ and the two must coexist."
  "metabase_dataset_store")

(def ^:private default-lease-seconds 300)

(defonce ^:private claim-owner
  (str (random-uuid)))

(defn- serialization-failure?
  "Redshift reports a serializable isolation violation as error 1023. Losing that race is the
  expected outcome of two processes claiming one dataset, not a fault."
  [^Throwable e]
  (boolean
   (some (fn [^Throwable t]
           (and (instance? SQLException t)
                (let [m (str (.getMessage t))]
                  (or (str/includes? m "1023")
                      (str/includes? m "Serializable isolation violation")))))
         (take 8 (iterate #(.getCause ^Throwable %) e)))))

(defn- table-name [tracking-schema]
  (str \" tracking-schema \" ".datasets"))

(defn- ->timestamp [inst]
  (cond
    (instance? Instant inst)        (java.sql.Timestamp/from ^Instant inst)
    (instance? java.util.Date inst) (java.sql.Timestamp. (.getTime ^java.util.Date inst))
    :else                           inst))

(defn- create-tracking-table! [spec tracking-schema]
  (jdbc/execute! spec [(format "CREATE SCHEMA IF NOT EXISTS \"%s\"" tracking-schema)])
  (jdbc/execute! spec [(format (str "CREATE TABLE IF NOT EXISTS %s ("
                                    " id VARCHAR(512) NOT NULL,"
                                    " state VARCHAR(16) NOT NULL,"
                                    " claim_owner VARCHAR(64),"
                                    " claimed_at TIMESTAMP,"
                                    " created_at TIMESTAMP NOT NULL)")
                               (table-name tracking-schema))]))

(defn- row->descriptor [{:keys [id state created_at]}]
  {:id id, :state (keyword state), :created-at created_at})

(defn- select-row [spec tracking-schema dataset-id]
  (first (jdbc/query spec [(format "SELECT id, state, created_at FROM %s WHERE id = ?"
                                   (table-name tracking-schema))
                           dataset-id])))

(defn- steal-expired-sql [tracking-schema]
  (format (str "UPDATE %s SET claim_owner = ?, claimed_at = GETDATE()"
               " WHERE id = ? AND state = 'loading'"
               " AND claimed_at < DATEADD(second, ?, GETDATE())")
          (table-name tracking-schema)))

(defn- claim-for-create!
  "Insert a claim for `dataset-id` if absent, or steal it if a previous claim's lease ran out.
  Returns true if this process now holds the claim."
  [spec tracking-schema lease-seconds dataset-id]
  (try
    (jdbc/with-db-transaction [t spec]
      (let [stolen (first (jdbc/execute! t [(steal-expired-sql tracking-schema)
                                            claim-owner dataset-id (- lease-seconds)]))
            ;; Guarded by NOT EXISTS rather than a uniqueness constraint, which Redshift does not
            ;; enforce; the surrounding serializable transaction is what makes the guard hold.
            added  (first (jdbc/execute!
                           t [(format (str "INSERT INTO %1$s (id, state, claim_owner, claimed_at,"
                                           " created_at)"
                                           " SELECT ?, 'loading', ?, GETDATE(), GETDATE()"
                                           " WHERE NOT EXISTS (SELECT 1 FROM %1$s WHERE id = ?)")
                                      (table-name tracking-schema))
                              dataset-id claim-owner dataset-id]))]
        (pos? (+ stolen added))))
    (catch Throwable e
      (if (serialization-failure? e)
        false
        (throw e)))))

(defn- claim-for-delete!
  "Claim `dataset-id` when it is ready, or when a previous claim's lease ran out. Never inserts.
  Returns true if this process now holds the claim."
  [spec tracking-schema lease-seconds dataset-id]
  (try
    (pos? (first (jdbc/execute!
                  spec
                  [(format (str "UPDATE %s SET state = 'loading', claim_owner = ?,"
                                " claimed_at = GETDATE()"
                                " WHERE id = ?"
                                " AND (state = 'ready' OR claimed_at < DATEADD(second, ?, GETDATE()))")
                           (table-name tracking-schema))
                   claim-owner dataset-id (- lease-seconds)])))
    (catch Throwable e
      (if (serialization-failure? e)
        false
        (throw e)))))

(defn- mark-ready!
  "Publish `dataset-id`. False if this process no longer holds the claim, meaning its lease was
  stolen and whatever it wrote has been superseded."
  [spec tracking-schema dataset-id]
  (pos? (first (jdbc/execute! spec [(format (str "UPDATE %s SET state = 'ready', claim_owner = NULL,"
                                                 " claimed_at = NULL"
                                                 " WHERE id = ? AND claim_owner = ?")
                                            (table-name tracking-schema))
                                    dataset-id claim-owner]))))

(defn- release-claim! [spec tracking-schema dataset-id]
  (jdbc/execute! spec [(format "DELETE FROM %s WHERE id = ? AND claim_owner = ?"
                               (table-name tracking-schema))
                       dataset-id claim-owner]))

(defn- recreate-dataset-schema!
  "Give `dataset-id` an empty schema of its own, discarding anything a dead loader left behind."
  [spec dataset-id]
  (let [schema (redshift.tx/dataset-schema dataset-id)]
    (jdbc/execute! spec [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema)])
    (jdbc/execute! spec [(format "CREATE SCHEMA \"%s\"" schema)])))

(defn- drop-dataset-schema!
  "Drop the whole schema. A dataset owns its schema outright, so this takes nothing else with it."
  [spec dataset-id]
  (jdbc/execute! spec [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE"
                               (redshift.tx/dataset-schema dataset-id))]))

(defn- criteria->where [{:keys [id-prefix state created-before]}]
  (let [clauses (cond-> []
                  ;; POSITION rather than LIKE: dataset ids contain `_`, a LIKE wildcard.
                  id-prefix        (conj ["POSITION(? IN id) = 1" id-prefix])
                  state            (conj ["state = ?" (name state)])
                  created-before   (conj ["created_at < ?" (->timestamp created-before)]))]
    (if (empty? clauses)
      [""]
      (into [(str " WHERE " (str/join " AND " (map first clauses)))] (map second) clauses))))

(defrecord RedshiftDatasetStore [spec tracking-schema lease-seconds setup load-dataset!]
  dataset-store/DatasetStore

  (create-dataset! [_this dataset-id dbdef]
    @setup
    (if (= "ready" (:state (select-row spec tracking-schema dataset-id)))
      :exists
      (if-not (claim-for-create! spec tracking-schema lease-seconds dataset-id)
        (if (= "ready" (:state (select-row spec tracking-schema dataset-id)))
          :exists
          :in-progress)
        (try
          ;; A stolen claim may leave a half-written schema behind, so start from nothing.
          (recreate-dataset-schema! spec dataset-id)
          ;; Data must be written as UTC or tests break; owned here so no caller has to remember it.
          (test.tz/with-system-timezone-id! "UTC"
            (load-dataset! dataset-id dbdef))
          (if (mark-ready! spec tracking-schema dataset-id)
            :created
            (if (= "ready" (:state (select-row spec tracking-schema dataset-id)))
              :exists
              :in-progress))
          (catch Throwable e
            (log/warnf "[redshift] failed to materialize %s: %s" dataset-id (ex-message e))
            (drop-dataset-schema! spec dataset-id)
            (release-claim! spec tracking-schema dataset-id)
            (throw e))))))

  (create-temp-isolated-dataset! [_this dbdef]
    @setup
    (let [dataset-id (dataset-store/temp-dataset-id dbdef)]
      ;; The claim always succeeds -- the id was just minted. Taking it anyway is what puts the row
      ;; in the tracking table, which is how a sweeper finds this dataset if its owner dies before
      ;; deleting it. Redshift cannot expire a schema or table on its own.
      (claim-for-create! spec tracking-schema lease-seconds dataset-id)
      (recreate-dataset-schema! spec dataset-id)
      (test.tz/with-system-timezone-id! "UTC"
        (load-dataset! dataset-id dbdef))
      (mark-ready! spec tracking-schema dataset-id)
      dataset-id))

  (delete-dataset! [_this dataset-id]
    @setup
    (if (claim-for-delete! spec tracking-schema lease-seconds dataset-id)
      (do
        (drop-dataset-schema! spec dataset-id)
        (release-claim! spec tracking-schema dataset-id)
        :deleted)
      (if (select-row spec tracking-schema dataset-id)
        :in-progress
        :absent)))

  (describe-dataset [_this dataset-id]
    @setup
    (some-> (select-row spec tracking-schema dataset-id) row->descriptor))

  (list-datasets [_this criteria]
    @setup
    (let [[where & params] (criteria->where criteria)]
      (into []
            (map row->descriptor)
            (jdbc/query spec (into [(format "SELECT id, state, created_at FROM %s%s"
                                            (table-name tracking-schema) where)]
                                   params))))))

(defn- default-load-dataset! [dataset-id dbdef]
  ((get-method tx/create-db! :sql-jdbc/test-extensions)
   :redshift
   (assoc dbdef :database-name dataset-id)))

(defn- server-connection-spec []
  (sql-jdbc.conn/connection-details->spec :redshift @redshift.tx/db-connection-details))

;; The DDL below is wrapped in a `delay`, so building a store performs no effect and the name needs
;; no `!`; the linter does not model `delay` and sees only the call.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn redshift-dataset-store
  "Build a [[metabase.test.data.dataset-store/DatasetStore]] over the Redshift cluster named by the
  usual test environment variables.

  Options, all defaulted: `:spec`, `:tracking-schema`, `:lease-seconds`, and `:load-dataset!`, a
  function of `[dataset-id dbdef]` that writes the dataset's tables into its schema."
  ([]
   (redshift-dataset-store {}))
  ([{:keys [spec tracking-schema lease-seconds load-dataset!]}]
   (let [spec            (or spec (server-connection-spec))
         tracking-schema (or tracking-schema default-tracking-schema)]
     (->RedshiftDatasetStore spec
                             tracking-schema
                             (or lease-seconds default-lease-seconds)
                             (delay (create-tracking-table! spec tracking-schema))
                             (or load-dataset! default-load-dataset!)))))
