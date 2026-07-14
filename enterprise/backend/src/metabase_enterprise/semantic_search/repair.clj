(ns metabase-enterprise.semantic-search.repair
  "Index repair functionality for detecting and fixing lost deletes in semantic search.

  When `metabase-enterprise.semantic-search.core/repair-index!` is called with the full set of documents
  that should be in the index, we re-gate new and updated documents, and also populate a temporary repair table
  with the model/model_id pairs of all provided documents. We use this repair table to do an anti-join against
  the gate table to find lost deletes that we issue tombstones for."
  (:require
   [clojure.set :as set]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn populate-repair-table!
  "Populates the repair table with model/model_id pairs from the provided documents.
  This creates a whitelist of documents that should exist in the index, to detect lost deletes."
  [pgvector repair-table-name documents]
  (when (seq documents)
    (let [repair-records (map #(-> (select-keys % [:model :id])
                                   (set/rename-keys {:id :model_id}))
                              documents)
          insert-sql (-> (sql.helpers/insert-into (keyword repair-table-name))
                         (sql.helpers/values repair-records)
                         (sql.helpers/on-conflict :model :model_id)
                         (sql.helpers/do-nothing)
                         (sql/format :quoted true))]
      (jdbc/execute! pgvector insert-sql)
      (log/debugf "Populated repair table with %d document records" (count repair-records)))))

(defn find-lost-deletes
  "Performs an anti-join to find documents that exist in the gate table
  but are not in the repair table. These represent lost deletes."
  [pgvector gate-table-name repair-table-name]
  (try
    (let [column        semantic.util/column-keyword
          anti-join-sql (-> (sql.helpers/select :model :model_id)
                            (sql.helpers/from (keyword gate-table-name))
                            (sql.helpers/where [:not [:exists
                                                      (-> (sql.helpers/select 1)
                                                          (sql.helpers/from (keyword repair-table-name))
                                                          (sql.helpers/where [:and
                                                                              [:= (column repair-table-name "model")
                                                                               (column gate-table-name "model")]
                                                                              [:= (column repair-table-name "model_id")
                                                                               (column gate-table-name "model_id")]]))]])
                            (sql/format :quoted true))
          results (jdbc/execute! pgvector anti-join-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (log/infof "Found %d documents in gate table that should be deleted" (count results))
      results)
    ;; TODO (Chris 2026-07-13) -- swallowing the error reads as "no lost deletes", so a transient anti-join
    ;; failure silently skips tombstoning that run. Tolerated because the next repair pass retries; revisit
    ;; if lost deletes start slipping through.
    (catch Exception e
      (log/errorf e "Error finding lost deletes between gate table %s and repair table %s"
                  gate-table-name repair-table-name))))

(defn find-lost-deletes-by-model
  "Finds lost deletes and groups them by model for easier processing.
  Returns a map of {model [id1 id2 ...]}."
  [pgvector gate-table-name repair-table-name]
  (when-let [lost-deletes (seq (find-lost-deletes pgvector gate-table-name repair-table-name))]
    (log/debugf "Repairing %d lost deletes" (count lost-deletes))
    (->> lost-deletes
         (group-by :model)
         (m/map-vals #(map :model_id %)))))

(defn- create-repair-table!
  "Creates an empty temporary table for tracking documents during index repair."
  [pgvector repair-table-name]
  (let [repair-table-ddl (-> (sql.helpers/create-table :unlogged (keyword repair-table-name) :if-not-exists)
                             (sql.helpers/with-columns [[:model :text :not-null]
                                                        [:model_id :text :not-null]
                                                        [[:primary-key :model :model_id]]])
                             (sql/format :quoted true))]
    (log/debugf "Creating repair table: %s" repair-table-name)
    (jdbc/execute! pgvector repair-table-ddl)))

(defn- drop-repair-table!
  [pgvector repair-table-name]
  (try
    (jdbc/execute! pgvector (-> (sql.helpers/drop-table :if-exists (keyword repair-table-name))
                                (sql/format :quoted true)))
    (log/infof "Cleaned up repair table: %s" repair-table-name)
    (catch Exception e
      (log/warnf e "Failed to drop repair table: %s" repair-table-name))))

(defn- repair-table-name
  "Generates a unique name for a repair table with timestamp for cleanup, qualified like the index tables
  so it lands in the module's schema when sharing the app db.
  Format: repair_<millis-since-epoch>_<short-id>"
  [index-metadata]
  (let [millis-since-epoch (t/to-millis-from-epoch (t/instant))
        short-id           (u/lower-case-en (u.str/random-string 6))]
    (format (:index-table-qualifier index-metadata "%s")
            (format "repair_%d_%s" millis-since-epoch short-id))))

(defn with-repair-table!
  "Creates a repair table, executes a function with the table name, and ensures cleanup.
  Returns the result of calling f with the repair table name."
  [pgvector index-metadata f]
  (let [repair-table (repair-table-name index-metadata)]
    (try
      (create-repair-table! pgvector repair-table)
      (f repair-table)
      (finally
        (drop-repair-table! pgvector repair-table)))))
