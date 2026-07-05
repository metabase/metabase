(ns metabase.search.appdb.table
  "Physical search-index tables: creating, dropping, detecting, and cleaning them up.

  This namespace knows how to manipulate the `search_index__*` tables themselves. It is deliberately
  unaware of the active/pending state machine (see [[metabase.search.appdb.index-state]]) and of the
  reindex write pipeline (see [[metabase.search.appdb.index]]) — those layers decide *which* table to
  touch; this one only knows *how* to create and destroy them."
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.h2 :as h2]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [metabase.search.config :as search.config]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.h2.jdbc JdbcSQLSyntaxErrorException)
   (org.postgresql.util PSQLException)))

(comment
  h2/keep-me
  postgres/keep-me)

(set! *warn-on-reflection* true)

(defn table-name
  "Normalize a table keyword to the literal name string used by the current app DB (H2 upper-cases)."
  [kw]
  (cond-> (name kw)
    (= :h2 (mdb/db-type)) u/upper-case-en))

(defn exists?
  "True if the given index table currently exists in the app DB."
  [table]
  (when table
    (t2/exists? :information_schema.tables :table_name (table-name table))))

(defn table-not-found-exception?
  "True if `e` looks like a missing-table error from the DB driver.
   Used to detect stale index table references — the caller should refresh state and retry.
   NOTE: can produce false positives on genuinely malformed queries, so only use in contexts
   where you have already verified the table name came from the index state store."
  [e]
  (or (instance? PSQLException (ex-cause e))
      (instance? JdbcSQLSyntaxErrorException (ex-cause e))))

(defn gen-table-name
  "Generate a unique table name to use as a search index table. If no suffix is provided, none will be used"
  ([]
   (gen-table-name ""))
  ([suffix]
   (keyword (str (str/replace (str "search_index__" (u/lower-case-en (u/generate-nano-id))) #"-" "_") suffix))))

(defn drop-table!
  "Drop the given index table if it exists. Returns true if a drop was issued."
  [table]
  (boolean
   (when table
     (t2/query (sql.helpers/drop-table :if-exists (keyword (table-name table)))))))

;;; -------------------------------------------- Schema --------------------------------------------

(defn- ->db-type [t]
  (get {:pk :int, :timestamp :timestamp-with-time-zone} t t))

(defn- ->db-column [c]
  (or (get {:id         :model_id
            :created-at :model_created_at
            :updated-at :model_updated_at}
           c)
      (keyword (u/->snake_case_en (name c)))))

(def ^:private not-null
  #{:archived :name})

(def ^:private default
  {:archived false})

;; If this fails, we'll need to increase the size of :model below
(assert (>= 32 (transduce (map (comp count name)) max 0 search.config/all-models)))

(def ^:private base-schema
  (into [[:model [:varchar 32] :not-null]
         [:display_data :text :not-null]
         [:legacy_input :text :not-null]
         ;; useful for tracking the speed and age of the index
         [:created_at :timestamp-with-time-zone
          [:default [:raw "CURRENT_TIMESTAMP"]]
          :not-null]
         [:updated_at :timestamp-with-time-zone :not-null]]
        (keep (fn [[k t]]
                (when t
                  (into [(->db-column k) (->db-type t)]
                        (concat
                         (when (not-null k)
                           [:not-null])
                         (when-some [d (default k)]
                           [[:default d]]))))))
        search.spec/attr-types))

(defn create-table!
  "Create an index table with the given name. Should fail if it already exists."
  [table-name]
  ;; Create with a separate transaction so that postgresql will complete the index creations before returning,
  ;; even when already running in a transaction
  (t2/with-transaction [_ (mdb/app-db)]
    (-> (sql.helpers/create-table table-name)
        (sql.helpers/with-columns (specialization/table-schema base-schema))
        t2/query)
    (let [table-name (name table-name)]
      (doseq [stmt (specialization/post-create-statements table-name table-name)]
        (t2/query stmt)))))

;;; --------------------------------------- Orphan cleanup -----------------------------------------

(defn- orphan-indexes []
  (map (comp keyword u/lower-case-en :table_name)
       (t2/query {:select [:table_name]
                  :from   :information_schema.tables
                  :where  [:and
                           [:= :table_schema :%current_schema]
                           [:or
                            [:like [:lower :table_name] [:inline "search\\_index\\_\\_%"]]
                            ;; legacy table names
                            [:in [:lower :table_name]
                             (mapv #(vector :inline %) ["search_index" "search_index_next" "search_index_retired"])]]
                           ;; Exclude temp tables — they are managed by with-temp-index-table
                           [:not-like [:lower :table_name] [:inline "%\\_temp"]]
                           [:not-in [:lower :table_name]
                            {:select [:%lower.index_name]
                             :from   [(t2/table-name :model/SearchIndexMetadata)]
                             :where  [:= :engine [:inline "appdb"]]}]]})))

(defn- drop-orphan-table!
  "Drop an orphaned index `table`, bounding how long the DROP will wait for the table's lock.

  [[delete-obsolete-tables!]] runs while the cluster reindex lock is held (it's called from `activate-table!`
  during a reindex). A `DROP TABLE` needs an exclusive lock, so if the orphan is still locked by a concurrent
  search transaction the DROP blocks indefinitely -- holding the cluster lock and deadlocking every other
  reindex behind it. Run the drop in its own transaction with a short `lock_timeout` so a contended drop fails
  fast (and is then skipped by the caller); the orphan is cleaned up on a later pass. Only Postgres needs this --
  H2 has a short default lock timeout and the appdb engine only runs on those two."
  [table]
  (t2/with-transaction [_ (mdb/app-db)]
    (when (= :postgres (mdb/db-type))
      (t2/query ["SET LOCAL lock_timeout = '5s'"]))
    (t2/query (sql.helpers/drop-table table))))

(defn delete-obsolete-tables!
  "Delete metadata for obsolete indexes and drop any physical tables no longer referenced by metadata."
  []
  ;; Delete metadata around indexes that are no longer needed.
  (search-index-metadata/delete-obsolete! (search.spec/index-version-hash))
  ;; Drop any indexes that are no longer referenced.
  (let [dropped (volatile! [])]
    (doseq [table (orphan-indexes)]
      (try
        (drop-orphan-table! table)
        (vswap! dropped conj table)
        ;; Deletion could fail if it races with other instances, or if the table is still locked (we use a short
        ;; lock timeout to avoid wedging) -- either way just skip it; it'll be retried on a later pass.
        (catch Exception e
          (log/warnf e "Failed to drop stale index %s" table))))
    (log/infof "Dropped %d stale indexes: %s" (count @dropped) @dropped)))
