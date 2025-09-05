(ns metabase-enterprise.metabot-v3.tools.search
  (:require
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [toucan2.core :as t2]))

(def ^:private entity-type->search-model
  "Maps API entity types to search engine model types"
  {"database"  "database"
   "table"     "table"
   "model"     "dataset"
   "metric"    "metric"
   "question"  "card"
   "dashboard" "dashboard"})

(def ^:private search-model->result-type
  "Maps search engine model types to result types"
  {"database"  :database
   "table"     :table
   "dataset"   :model
   "metric"    :metric
   "card"      :question
   "dashboard" :dashboard})

(defn- transform-search-result
  "Transform a single search result to match the appropriate entity-specific schema.

   Field mapping:
   - Tables: name = technical table name (table_name), include database_id and database_schema
   - Models: name = display name, include database_id and database_schema
   - Other entities: name = display name, no database fields"
  [result]
  (let [model (:model result)
        result-type (search-model->result-type model)]
    (case model
      "table"
      {:id              (:id result)
       :type            result-type
       :name            (:table_name result)
       :display_name    (:name result)
       :description     (:description result)
       :database_id     (:database_id result)
       :database_schema (:table_schema result)}

      "dataset"
      {:id              (:id result)
       :type            result-type
       :name            (:name result)
       :display_name    (:name result)
       :description     (:description result)
       :database_id     (:database_id result)
       :verified        (boolean (:verified result))}

      ;; For dashboards, questions, and metrics:
      {:id              (:id result)
       :type            result-type
       :name            (:name result)
       :description     (:description result)
       :verified        (boolean (or (:verified result)
                                     (= "verified" (:moderated_status result))))})))

(defn- search-result-id
  "Generate a unique identifier for a search result based on its id and model."
  [search-result]
  [(get search-result :id) (get search-result :model)])

(defn- reciprocal-rank-fusion
  "Combine multiple ranked search result lists using Reciprocal Rank Fusion (RRF).

  Takes a list of search result lists and combines them by:
  1. Calculating RRF scores for each item based on its rank in each list
  2. Summing scores for items that appear in multiple lists
  3. Returning items sorted by total RRF score (descending)

  The RRF score is calculated as: 1 / (k + r) where k=60 (typical RRF constant)"
  [result-lists]
  (let [k 60
        rrf-results (reduce
                     (fn [acc-map result-list]
                       (reduce-kv
                        (fn [acc rank search-result]
                          (let [id (search-result-id search-result)
                                rrf-score (/ 1.0 (+ k (inc rank)))]
                            (if (contains? acc id)
                              (update-in acc [id :rrf] + rrf-score)
                              (assoc acc id {:search-result search-result
                                             :rrf rrf-score}))))
                        acc-map
                        (vec result-list)))
                     {}
                     result-lists)]
    (->> rrf-results
         vals
         (sort-by :rrf >)  ; Sort by RRF score descending
         (map :search-result))))

(defn search
  "Search for data sources (tables, models, cards, dashboards, metrics) in Metabase.
  Abstracted from the API endpoint logic."
  [{:keys [term-queries semantic-queries database-id created-at last-edited-at
           entity-types limit metabot-id]}]
  (let [search-models (if (seq entity-types)
                        (set (distinct (keep entity-type->search-model entity-types)))
                        (set (vals entity-type->search-model)))
        all-queries   (distinct (concat (or term-queries []) (or semantic-queries [])))
        metabot (t2/select-one :model/Metabot :entity_id (get-in metabot-v3.config/metabot-config [metabot-id :entity-id] metabot-id))
        use-verified-content? (if metabot-id
                                (:use_verified_content metabot)
                                false)
        ;; Run a search for each query, maintaining result order in list of lists
        result-lists (map
                      (fn [query]
                        (let [search-context (search/search-context
                                              (merge
                                               {:search-string query
                                                :models search-models
                                                :table-db-id database-id
                                                :created-at created-at
                                                :last-edited-at last-edited-at
                                                :current-user-id api/*current-user-id*
                                                :is-impersonated-user? (perms/impersonated-user?)
                                                :is-sandboxed-user? (perms/sandboxed-user?)
                                                :is-superuser? api/*is-superuser?*
                                                :current-user-perms @api/*current-user-permissions-set*
                                                :context :metabot
                                                :archived false
                                                :limit (or limit 50)
                                                :offset 0}
                                               (when use-verified-content?
                                                 {:verified true})))
                              search-results (search/search search-context)]
                          (:data search-results)))
                      all-queries)
        ;; Use RRF to combine and reorder results
        fused-results (reciprocal-rank-fusion result-lists)]
    (map transform-search-result fused-results)))
