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
  "Return gate documents absent from the repair table, representing lost deletes.

  Throws when the anti-join fails so the repair cannot publish a snapshot from incomplete evidence."
  [pgvector gate-table-name repair-table-name]
  (let [column        semantic.util/column-keyword
        anti-join-sql (sql/format
                       {:select [:model :model_id]
                        :from   [(keyword gate-table-name)]
                        :where  [:not
                                 [:exists
                                  {:select [1]
                                   :from   [(keyword repair-table-name)]
                                   :where  [:and
                                            [:= (column repair-table-name "model")
                                             (column gate-table-name "model")]
                                            [:= (column repair-table-name "model_id")
                                             (column gate-table-name "model_id")]]}]]}
                       :quoted true)
        results (jdbc/execute! pgvector anti-join-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
    (log/infof "Found %d documents in gate table that should be deleted" (count results))
    results))

(defn find-lost-deletes-by-model
  "Finds lost deletes and groups them by model for easier processing.
  Returns a map of {model [id1 id2 ...]}."
  [pgvector gate-table-name repair-table-name]
  (when-let [lost-deletes (seq (find-lost-deletes pgvector gate-table-name repair-table-name))]
    (log/debugf "Repairing %d lost deletes" (count lost-deletes))
    (->> lost-deletes
         (group-by :model)
         (m/map-vals #(map :model_id %)))))

(defn count-stale-orphans
  "Count rows in the active index table whose `(model, model_id)` is absent from the repair table (the current
  candidate set) AND has no live or pending gate row -- garbage whose gated delete the indexer has already
  consumed yet whose index row still stands. `metadata-row` supplies the indexer's composite
  `(indexer_last_seen, indexer_last_seen_id)` consumption watermark; only tombstones at/behind it count, so
  in-flight deletes and current DLQ retries (the staleness metric's backlog) don't read as garbage.
  Callers run this BEFORE the current repair's own gate-deletes, for the same reason: a freshly found lost
  delete would otherwise push a garbage spike that stands until the next hourly repair.
  Returns nil if the count query fails: this feeds only the garbage health metric, so a metric-read blip
  must not fail the repair run whose real work already committed."
  [pgvector index-table-name gate-table-name repair-table-name dlq-table-name metadata-row]
  ;; Unlike find-lost-deletes' gate-based anti-join, measuring on the index table excludes retained
  ;; tombstones for rows the indexer already removed, which would keep the count inflated until tombstone
  ;; cleanup runs.
  (try
    (let [{:keys [indexer_last_seen indexer_last_seen_id]} metadata-row
          count-sql (sql/format
                     {:select [[:%count.* :n]]
                      :from   [[(keyword index-table-name) :i]]
                      :where  [:and
                               [:not
                                [:exists
                                 {:select [1]
                                  :from   [[(keyword repair-table-name) :r]]
                                  :where  [:and
                                           [:= :r.model :i.model]
                                           [:= :r.model_id :i.model_id]]}]]
                               ;; no live gate row (document_hash NULL or row gone) and no pending tombstone the
                               ;; indexer hasn't consumed yet ((gated_at, id) past the watermark). A nil watermark
                               ;; (indexer never ran) reads all tombstones as pending; a nil watermark id treats
                               ;; same-timestamp tombstones as pending ('' sorts before every real gate id) --
                               ;; conservative in both cases, no false spike.
                               [:not
                                [:exists
                                 {:select [1]
                                  :from   [[(keyword gate-table-name) :g]]
                                  :where  [:and
                                           [:= :g.model :i.model]
                                           [:= :g.model_id :i.model_id]
                                           [:or
                                            [:!= :g.document_hash nil]
                                            [:> [:composite :g.gated_at :g.id]
                                             [:composite
                                              [:coalesce [:lift indexer_last_seen]
                                               [:raw "'-infinity'::timestamptz"]]
                                              [:coalesce [:lift indexer_last_seen_id] ""]]]]]}]]
                               ;; A failed delete may sit behind the watermark: stalled-mode advances it after
                               ;; moving the failure to the DLQ. The current gate generation still owns that retry,
                               ;; so it is pending work rather than garbage.
                               [:not
                                [:exists
                                 {:select [1]
                                  :from   [[(keyword dlq-table-name) :d]]
                                  :join   [[(keyword gate-table-name) :dg]
                                           [:and
                                            [:= :dg.id :d.gate_id]
                                            [:= :dg.gated_at :d.error_gated_at]]]
                                  :where  [:and
                                           [:= :dg.model :i.model]
                                           [:= :dg.model_id :i.model_id]]}]]]}
                     :quoted true)]
      (or (:n (jdbc/execute-one! pgvector count-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})) 0))
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/errorf e "Error counting stale orphans in index table %s against repair table %s"
                  index-table-name repair-table-name)
      nil)))

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
