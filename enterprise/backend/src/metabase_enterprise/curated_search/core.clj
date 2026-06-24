(ns metabase-enterprise.curated-search.core
  "Enterprise implementation of the library entity index: pgvector-backed similarity search over the
  per-value `library_entity_index` documents, and the write-path nudge that keeps the index fresh.

  OSS shims live in [[metabase.curated-search.mirror]]; the background sync they nudge is the
  [[metabase-enterprise.curated-search.task.sync]] Quartz job."
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.task.core :as task]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def sync-job-key
  "Quartz job key of the background sync; [[request-sync!]] triggers it and
  [[metabase-enterprise.curated-search.task.sync]] schedules it."
  (jobs/key "metabase-enterprise.curated-search.sync.job"))

(defn pgvector-configured?
  "True when a pgvector store is configured (read once at boot from MB_PGVECTOR_DB_URL).
  The sync task gates scheduling on this rather than [[available?]], so the periodic safety net exists
  even when the semantic-search feature is turned on after startup (a common onboarding flow)."
  []
  (string? (not-empty semantic.db.datasource/db-url)))

(defn available?
  "Whether the curated search mirror can run right now: a pgvector store is configured and the license
  includes semantic search.
  The feature check can flip at runtime (token entered post-boot), so callers re-evaluate per use."
  []
  (and (pgvector-configured?)
       (premium-features/has-feature? :semantic-search)))

(defenterprise request-sync!
  "Trigger the background sync job to reconcile the mirror soon.
  Fire-and-forget: [[metabase.task.core/trigger-now!]] swallows scheduler errors, and the job's periodic
  schedule covers anything a lost trigger misses."
  :feature :semantic-search
  []
  (when (available?)
    (task/trigger-now! sync-job-key)))

(def ^:private default-limit 10)

(def ^:private weights
  "Blended-score weights, keyed like regular search's scorer weights (a namespaced keyword per variant).
  Similarity is the base; the slight per-doc_type bump lets a name match edge out a synonym on a tie."
  {:similarity       1.0
   :doc-type/name    0.02
   :doc-type/synonym 0.01})

(defn- doc-type-boost ^double [doc-type]
  (double (get weights (keyword "doc-type" doc-type) 0.0)))

(defn- scorer [nm score weight]
  (let [score (double score) weight (double weight)]
    {:name nm :score score :weight weight :contribution (* score weight)}))

(defn- score
  "Weighted-scorer breakdown for one row: a `:scores` vector of `{:name :score :weight :contribution}`
  plus the weighted-sum `:total_score`."
  [{:keys [distance doc_type]}]
  (let [scores [(scorer :similarity (- 1.0 (double distance)) (:similarity weights))
                (scorer :doc-type 1.0 (doc-type-boost doc_type))]]
    {:scores      scores
     :total_score (reduce + (map :contribution scores))}))

(defn- ranking-sql
  "`distance - doc_type_boost`: a boosted doc_type sorts earlier even when slightly farther."
  [distance-expr]
  (let [cases (str/join " " (for [[k w] weights :when (= "doc-type" (namespace k))]
                              (format "WHEN doc_type = '%s' THEN %s" (name k) w)))]
    (format "(%s) - (CASE %s ELSE 0.0 END)" distance-expr cases)))

(defenterprise search
  "Find the library-entity documents best matching `user-search-prompt`, up to `limit`, ranked by a
  blended score (cosine similarity plus a slight doc_type bump).
  Each result is shaped `{:entity {:model :id} :doc_type :doc_text :score}`, best score first; the caller
  dedupes the (many-per-entity) docs down to distinct entities.
  Returns [] when the pgvector store is unconfigured."
  :feature :semantic-search
  [user-search-prompt limit]
  (if-not (available?)
    []
    (let [pgvector  (semantic.db.datasource/ensure-initialized-data-source!)
          limit     (or limit default-limit)
          model     (embedding/get-configured-model)
          embedding (embedding/get-embedding model user-search-prompt
                                             {:type :query :record-tokens? true})
          lit       (index-table/format-embedding embedding)
          distance  (str "doc_embedding <=> " lit)
          rows      (try
                      (jdbc/execute!
                       pgvector
                       (-> (sql.helpers/select :entity_type :entity_local_id :doc_type :doc_text
                                               [[:raw distance] :distance])
                           (sql.helpers/from (keyword index-table/*vectors-table*))
                           ;; Exact scan, no HNSW: the blended order-by can't use an ANN index, and the
                           ;; curated set is tiny.
                           (sql.helpers/order-by [[:raw (ranking-sql distance)] :asc])
                           (sql.helpers/limit limit)
                           (sql/format {:quoted true}))
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                      ;; 42P01 = undefined table: the background sync hasn't created the index yet.
                      (catch SQLException e
                        (if (= "42P01" (.getSQLState e)) [] (throw e))))]
      (->> rows
           (map (fn [row]
                  {:entity   {:model (:entity_type row) :id (:entity_local_id row)}
                   :doc_type (:doc_type row)
                   :doc_text (:doc_text row)
                   :score    (score row)}))
           (sort-by (comp :total_score :score) >)
           vec))))
