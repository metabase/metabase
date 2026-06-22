(ns metabase-enterprise.curated-search.core
  "Enterprise implementation of the curated search mirror: pgvector-backed similarity search over the
  curated `curated_search_entries` table, and the write-path nudge that keeps the mirror fresh.

  OSS shims live in [[metabase.curated-search.mirror]]; the background sync they nudge is the
  [[metabase-enterprise.curated-search.task.sync]] Quartz job."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.task.core :as task]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql SQLException)
   (org.postgresql.util PGobject)))

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

;; Weighted scoring shaped like regular search (metabase.search.scoring): each factor contributes
;; weight * score; similarity (1 - cosine distance) is primary, verified a flat 0/1 boost.
(def ^:private similarity-weight 1.0)
(def ^:private verified-weight 0.1)
(def ^:private default-limit 10)

(defn- scorer [nm score weight]
  (let [score (double score) weight (double weight)]
    {:name nm :score score :weight weight :contribution (* score weight)}))

(defn- score
  "Build a weighted-scorer breakdown for one row, shaped like regular search's scoring.
  Returns a `:scores` vector of `{:name :score :weight :contribution}` plus the weighted-sum
  `:total_score`."
  [{:keys [distance verified]}]
  (let [scores [(scorer :similarity (- 1.0 (double distance)) similarity-weight)
                (scorer :verified   (if verified 1.0 0.0)      verified-weight)]]
    {:scores      scores
     :total_score (reduce + (map :contribution scores))}))

(defn- decode-entity [v]
  (cond
    (instance? PGobject v) (json/decode (.getValue ^PGobject v) true)
    (string? v)            (json/decode v true)
    :else                  v))

(defenterprise search
  "Find the saved prompts nearest to `user-search-prompt` by cosine distance, up to `limit`.
  Results are ranked by blended score (similarity + verified boost), each shaped
  `{:saved_search_prompt :usage_instructions :entity :score}`.
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
          ;; Order by the blended score, not raw distance, so a verified row whose boost lifts it into
          ;; the top N survives the LIMIT. No HNSW index could accelerate this expression — see
          ;; index-table for why the table has none.
          ranking   (format "(embedding <=> %s) - (CASE WHEN verified THEN %s ELSE 0.0 END)"
                            lit verified-weight)
          rows      (try
                      (jdbc/execute!
                       pgvector
                       (-> (sql.helpers/select :search_prompt :usage_instructions :entity :verified
                                               [[:raw (str "embedding <=> " lit)] :distance])
                           (sql.helpers/from (keyword index-table/*vectors-table*))
                           (sql.helpers/order-by [[:raw ranking] :asc])
                           (sql.helpers/limit limit)
                           (sql/format {:quoted true}))
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                      ;; 42P01 = undefined table: the background sync hasn't created the mirror yet.
                      (catch SQLException e
                        (if (= "42P01" (.getSQLState e)) [] (throw e))))]
      (->> rows
           (map (fn [row]
                  {:saved_search_prompt (:search_prompt row)
                   :usage_instructions  (:usage_instructions row)
                   :entity              (decode-entity (:entity row))
                   :score               (score row)}))
           (sort-by (comp :total_score :score) >)
           vec))))
