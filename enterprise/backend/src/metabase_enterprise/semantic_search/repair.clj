(ns metabase-enterprise.semantic-search.repair
  "Index repair functionality for detecting and fixing lost deletes in semantic search."
  (:require
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn populate-repair-table!
  "Populates the repair table with model/model_id pairs from the provided documents.
  This creates a whitelist of documents that should exist in the index, to detect lost deletes."
  [pgvector repair-table-name documents]
  (when (seq documents)
    (let [repair-records (map (fn [{:keys [model id]}]
                                {:model model :model_id (str id)})
                              documents)
          insert-sql (-> (sql.helpers/insert-into (keyword repair-table-name))
                         (sql.helpers/values repair-records)
                         (sql.helpers/on-conflict :model :model_id)
                         (sql.helpers/do-nothing)
                         (sql/format :quoted true))]
      (jdbc/execute! pgvector insert-sql)
      (log/debugf "Populated repair table with %d document records" (count repair-records)))))

(defn find-lost-deletes
  "Performs an anti-join to find documents that exist in the active index
  but are not in the repair table. These represent lost deletes."
  [pgvector index-table-name repair-table-name]
  (let [anti-join-sql (-> (sql.helpers/select :model :model_id)
                          (sql.helpers/from (keyword index-table-name))
                          (sql.helpers/where [:not [:exists
                                                    (-> (sql.helpers/select 1)
                                                        (sql.helpers/from (keyword repair-table-name))
                                                        (sql.helpers/where [:and
                                                                            [:= (keyword repair-table-name "model")
                                                                             (keyword index-table-name "model")]
                                                                            [:= (keyword repair-table-name "model_id")
                                                                             (keyword index-table-name "model_id")]]))]])
                          (sql/format :quoted true))
        results (jdbc/execute! pgvector anti-join-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
    (log/infof "Found %d documents in index that should be deleted" (count results))
    results))

(defn- create-repair-table!
  "Creates a temporary table for tracking documents during index repair."
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
  (jdbc/execute! pgvector (-> (sql.helpers/drop-table :if-exists (keyword repair-table-name))
                              (sql/format :quoted true)))
  (log/infof "Cleaned up repair table: %s" repair-table-name))

(defn with-repair-table!
  "Creates a repair table, executes a function with the table name, and ensures cleanup.
  Returns the result of calling f with the repair table name."
  [pgvector index-version f]
  (let [repair-table-name (str "index_repair_" index-version)]
    (try
      (create-repair-table! pgvector repair-table-name)
      (f repair-table-name)
      (finally
        (drop-repair-table! pgvector repair-table-name)))))

(defn find-lost-deletes-by-model
  "Finds lost deletes and groups them by model for easier processing.
  Returns a map of {model [id1 id2 ...]}."
  [pgvector active-index-name repair-table-name]
  (when-let [lost-deletes (seq (find-lost-deletes pgvector active-index-name repair-table-name))]
    (log/debugf "Repairing %d lost deletes" (count lost-deletes))
    (->> lost-deletes
         (group-by :model)
         (m/map-vals #(map :model_id %)))))
