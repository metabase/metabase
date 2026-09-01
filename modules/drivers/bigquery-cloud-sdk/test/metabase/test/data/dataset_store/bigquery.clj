(ns metabase.test.data.dataset-store.bigquery
  "BigQuery implementation of [[metabase.test.data.dataset-store/DatasetStore]].

  A dataset is a BigQuery dataset named by its dataset id. Claims and use timestamps live in a table
  in a dataset of its own, visible to every process reaching this project.

  Atomicity rests on BigQuery serializing mutating DML against a single table, so a `MERGE` either
  takes the claim or does nothing. BigQuery's client here returns rows rather than an affected-row
  count, so a claim reads back who owns it afterwards; the MERGE remains the point at which the
  race is decided, and a caller that lost simply sees someone else's name.

  Alternative worth weighing: BigQuery dataset labels can carry the same state, and the plan in
  `dev/notes/dataset-store-plan.md` leans that way. Labels have no compare-and-set through SQL,
  which a claim needs, so this uses a table."
  (:require
   [clojure.string :as str]
   [metabase.test.data.bigquery-cloud-sdk :as bq.tx]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.interface :as tx]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.log :as log])
  (:import
   (java.time Instant ZoneOffset)))

(set! *warn-on-reflection* true)

(def ^:private default-tracking-dataset
  "Not the tracking dataset the older scheme writes to: the columns differ and the two must coexist
  in one project."
  "metabase_dataset_store")

(def ^:private default-lease-seconds 300)

(def ^:private temp-dataset-expiration-days
  "BigQuery expires a dataset's tables on its own, which no other warehouse here can do. Two hours,
  as a backstop under `with-temp-dataset` rather than a replacement for it."
  (/ 2.0 24))

(defonce ^:private claim-owner
  (str (random-uuid)))

;;; ------------------------------------------------ SQL ------------------------------------------------

(def ^:private expired-claim
  "Predicate for a claim whose lease has run out. Shared by claim acquisition for creation and for
  deletion so the two cannot disagree about what expiry means."
  "d.claimed_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL %d SECOND)")

(defn- table-name [tracking-dataset]
  (format "`%s.%s.datasets`" (bq.tx/project-id) tracking-dataset))

(defn- create-tracking-table! [tracking-dataset]
  (bq.tx/execute! "CREATE SCHEMA IF NOT EXISTS `%s.%s`" (bq.tx/project-id) tracking-dataset)
  (bq.tx/execute! (str "CREATE TABLE IF NOT EXISTS %s ("
                       " id STRING NOT NULL,"
                       " state STRING NOT NULL,"
                       " claim_owner STRING,"
                       " claimed_at TIMESTAMP,"
                       " created_at TIMESTAMP NOT NULL)")
                  (table-name tracking-dataset)))

;; A read, despite the `!` on the general-purpose executor it goes through.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn- select-row
  "Return `[state claim-owner created-at]` for `dataset-id`, or nil."
  [tracking-dataset dataset-id]
  (first (bq.tx/execute-params!
          (format "SELECT state, claim_owner, created_at FROM %s WHERE id = ?"
                  (table-name tracking-dataset))
          [dataset-id])))

(defn- owns-claim?
  "Did this process end up holding the claim on `dataset-id`?"
  [tracking-dataset dataset-id]
  (= claim-owner (second (select-row tracking-dataset dataset-id))))

(defn- claim-for-create!
  "Take the claim on `dataset-id`, inserting the row if absent or stealing it if its lease expired.
  Returns true if this process now holds it."
  [tracking-dataset lease-seconds dataset-id]
  (bq.tx/execute-params!
   (format (str "MERGE INTO %s d"
                " USING (SELECT ? AS id, ? AS owner) s ON d.id = s.id"
                " WHEN MATCHED AND d.state = 'loading' AND " expired-claim
                "   THEN UPDATE SET claim_owner = s.owner, claimed_at = CURRENT_TIMESTAMP()"
                " WHEN NOT MATCHED"
                "   THEN INSERT (id, state, claim_owner, claimed_at, created_at)"
                "   VALUES (s.id, 'loading', s.owner, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())")
           (table-name tracking-dataset)
           lease-seconds)
   [dataset-id claim-owner])
  (owns-claim? tracking-dataset dataset-id))

(defn- claim-for-delete!
  "Take the claim on `dataset-id` when it is ready, or when a previous claim's lease ran out. Never
  inserts. Returns true if this process now holds it."
  [tracking-dataset lease-seconds dataset-id]
  (bq.tx/execute-params!
   (format (str "MERGE INTO %s d"
                " USING (SELECT ? AS id, ? AS owner) s ON d.id = s.id"
                " WHEN MATCHED AND (d.state = 'ready' OR " expired-claim ")"
                "   THEN UPDATE SET state = 'loading', claim_owner = s.owner,"
                "                   claimed_at = CURRENT_TIMESTAMP()")
           (table-name tracking-dataset)
           lease-seconds)
   [dataset-id claim-owner])
  (owns-claim? tracking-dataset dataset-id))

(defn- mark-ready!
  "Publish `dataset-id`. False if this process no longer holds the claim, meaning its lease was
  stolen and whatever it wrote has been superseded.

  Leaves `claim_owner` set: it is the only way to tell our publish from someone else's, given no
  affected-row count."
  [tracking-dataset dataset-id]
  (bq.tx/execute-params!
   (format (str "UPDATE %s SET state = 'ready', claimed_at = NULL"
                " WHERE id = ? AND claim_owner = ?")
           (table-name tracking-dataset))
   [dataset-id claim-owner])
  (let [[state owner] (select-row tracking-dataset dataset-id)]
    (and (= "ready" state) (= claim-owner owner))))

(defn- release-claim! [tracking-dataset dataset-id]
  (bq.tx/execute-params!
   (format "DELETE FROM %s WHERE id = ? AND claim_owner = ?" (table-name tracking-dataset))
   [dataset-id claim-owner]))

(defn- drop-dataset! [dataset-id]
  (bq.tx/execute! "DROP SCHEMA IF EXISTS `%s.%s` CASCADE" (bq.tx/project-id) dataset-id))

(defn- create-dataset-container!
  "Create the BigQuery dataset itself. `expiration-days`, when given, has BigQuery expire its tables
  without anyone asking."
  [dataset-id expiration-days]
  (bq.tx/execute! (str "CREATE SCHEMA IF NOT EXISTS `%s.%s`"
                       (when expiration-days
                         (format " OPTIONS(default_table_expiration_days=%.4f)" expiration-days)))
                  (bq.tx/project-id)
                  dataset-id))

(defn- expiration-days
  "Days after which BigQuery expires a dataset's tables, or nil to keep them indefinitely.

  Read off the id rather than off which method is creating it: [[dataset-store/temp-id-prefix]] is
  what says a dataset is disposable, whoever minted it."
  [dataset-id]
  (when (str/starts-with? dataset-id dataset-store/temp-id-prefix)
    temp-dataset-expiration-days))

(defn- ->timestamp
  "An instant in a shape BigQuery will bind as a TIMESTAMP parameter.

  `Instant` is not one of them: the driver's parameter table covers `OffsetDateTime` and
  `ZonedDateTime` but falls through on `Instant`. Converting here rather than making callers pass a
  BigQuery-shaped value keeps `:created-before` the same kind of thing for every store."
  [inst]
  (if (instance? Instant inst)
    (.atOffset ^Instant inst ZoneOffset/UTC)
    inst))

(defn- criteria->where [{:keys [id-prefix state created-before]}]
  (let [clauses (cond-> []
                  ;; STARTS_WITH rather than LIKE: dataset ids contain `_`, a LIKE wildcard.
                  id-prefix        (conj ["STARTS_WITH(id, ?)" id-prefix])
                  state            (conj ["state = ?" (name state)])
                  created-before   (conj ["created_at < ?" (->timestamp created-before)]))]
    (if (empty? clauses)
      [""]
      (into [(str " WHERE " (str/join " AND " (map first clauses)))] (map second) clauses))))

;;; ------------------------------------------------ Store ------------------------------------------------

(defn- materialize!
  "Write `dbdef`'s tables into the dataset named by `dataset-id`.

  Data must be written as UTC or tests break; owned here so no caller has to remember it."
  [dataset-id dbdef]
  (test.tz/with-system-timezone-id! "UTC"
    (tx/create-db! :bigquery-cloud-sdk (assoc dbdef :database-name dataset-id))))

(defrecord BigQueryDatasetStore [tracking-dataset lease-seconds setup]
  dataset-store/DatasetStore

  (create-dataset! [_this dataset-id dbdef]
    @setup
    (if (= "ready" (first (select-row tracking-dataset dataset-id)))
      :exists
      (if-not (claim-for-create! tracking-dataset lease-seconds dataset-id)
        (if (= "ready" (first (select-row tracking-dataset dataset-id)))
          :exists
          :in-progress)
        (try
          ;; A stolen claim may leave a half-written dataset behind, so start from nothing.
          (drop-dataset! dataset-id)
          (create-dataset-container! dataset-id (expiration-days dataset-id))
          (materialize! dataset-id dbdef)
          (if (mark-ready! tracking-dataset dataset-id)
            :created
            (if (= "ready" (first (select-row tracking-dataset dataset-id)))
              :exists
              :in-progress))
          (catch Throwable e
            (log/warnf "[bigquery] failed to materialize %s: %s" dataset-id (ex-message e))
            (drop-dataset! dataset-id)
            (release-claim! tracking-dataset dataset-id)
            (throw e))))))

  (create-temp-isolated-dataset! [_this dbdef]
    @setup
    (let [dataset-id (dataset-store/temp-dataset-id dbdef)]
      ;; The claim always succeeds -- the id was just minted. Taking it anyway is what puts the row
      ;; in the tracking table, which is how a sweeper finds this dataset if its owner dies first.
      (claim-for-create! tracking-dataset lease-seconds dataset-id)
      (create-dataset-container! dataset-id (expiration-days dataset-id))
      (materialize! dataset-id dbdef)
      (mark-ready! tracking-dataset dataset-id)
      dataset-id))

  (delete-dataset! [_this dataset-id]
    @setup
    (if (claim-for-delete! tracking-dataset lease-seconds dataset-id)
      ;; Claim first, drop second: holding the claim stops another caller from creating this dataset
      ;; between the drop and the row's removal.
      (do
        (drop-dataset! dataset-id)
        (release-claim! tracking-dataset dataset-id)
        :deleted)
      (if (select-row tracking-dataset dataset-id)
        :in-progress
        :absent)))

  (describe-dataset [_this dataset-id]
    @setup
    (when-let [[state _owner created-at] (select-row tracking-dataset dataset-id)]
      {:id dataset-id, :state (keyword state), :created-at created-at}))

  (list-datasets [_this criteria]
    @setup
    (let [[where & params] (criteria->where criteria)]
      (into []
            (map (fn [[id state created-at]]
                   {:id id, :state (keyword state), :created-at created-at}))
            (bq.tx/execute-params!
             (format "SELECT id, state, created_at FROM %s%s"
                     (table-name tracking-dataset) where)
             (vec params))))))

;; The DDL below is wrapped in a `delay`, so building a store performs no effect and the name needs
;; no `!`; the linter does not model `delay` and sees only the call.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn bigquery-dataset-store
  "Build a [[metabase.test.data.dataset-store/DatasetStore]] over the BigQuery project named by the
  usual test environment variables.

  Options, both defaulted: `:tracking-dataset` and `:lease-seconds`."
  ([]
   (bigquery-dataset-store {}))
  ([{:keys [tracking-dataset lease-seconds]}]
   (let [tracking-dataset (or tracking-dataset default-tracking-dataset)]
     (->BigQueryDatasetStore tracking-dataset
                             (or lease-seconds default-lease-seconds)
                             (delay (create-tracking-table! tracking-dataset))))))
