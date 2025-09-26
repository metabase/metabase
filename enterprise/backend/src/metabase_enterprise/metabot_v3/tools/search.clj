(ns metabase-enterprise.metabot-v3.tools.search
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private metabot-search-models
  #{"table" "dataset" "card" "dashboard" "metric" "database" "transform"})

(def ^:private search-model-mappings
  "Maps metabot entity types to search engine model types"
  {"model"    "dataset"
   "question" "card"})

(defn- entity-type->search-model
  [entity-type]
  (get search-model-mappings entity-type entity-type))

(defn- search-model->result-type
  [search-model]
  (get (set/map-invert search-model-mappings) search-model search-model))

(defn- transform-search-result
  "Transform a single search result to match the appropriate entity-specific schema."
  [{:keys [verified moderated_status collection] :as result}]
  (let [model (:model result)
        verified? (or (boolean verified) (= moderated_status "verified"))
        collection-info (select-keys collection [:name :authority_level])
        common-fields {:id           (:id result)
                       :type         (search-model->result-type model)
                       :name         (:name result)
                       :description  (:description result)
                       :updated_at   (:updated_at result)
                       :created_at   (:created_at result)}]
    (case model
      "database"
      common-fields

      "table"
      (merge common-fields
             {:name            (:table_name result)
              :display_name    (:name result)
              :database_id     (:database_id result)
              :database_schema (:table_schema result)})

      "dashboard"
      (merge common-fields
             {:verified        verified?
              :collection      collection-info})

      ;; Questions, metrics, and datasets
      (merge common-fields
             {:database_id     (:database_id result)
              :verified        verified?
              :collection      collection-info}))))

(defn- search-result-id
  "Generate a unique identifier for a search result based on its id and model."
  [search-result]
  ((juxt :id :model) search-result))

(defn- reciprocal-rank-fusion
  "Combine multiple ranked search result lists using Reciprocal Rank Fusion (RRF).

  Takes a list of search result lists and combines them by:
  1. Calculating RRF scores for each item based on its rank in each list
  2. Summing scores for items that appear in multiple lists
  3. Returning items sorted by total RRF score (descending)

  The RRF score is calculated as: 1 / (k + r) where k defaults to 60 (typical RRF constant)"
  ([result-lists]
   (reciprocal-rank-fusion result-lists 60))
  ([result-lists k]
   (let [rrf-results (reduce
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
          (sort-by :rrf >)
          (map :search-result)))))

(defn search
  "Search for data sources (tables, models, cards, dashboards, metrics) in Metabase.
  Abstracted from the API endpoint logic."
  [{:keys [term-queries semantic-queries database-id created-at last-edited-at
           entity-types limit metabot-id search-native-query]}]
  (log/infof "[METABOT-SEARCH] Starting search with params: %s"
             {:term-queries term-queries
              :semantic-queries semantic-queries
              :database-id database-id
              :created-at created-at
              :last-edited-at last-edited-at
              :entity-types entity-types
              :limit limit
              :metabot-id metabot-id
              :search-native-query search-native-query})
  (let [search-models (if (seq entity-types)
                        (set (distinct (keep entity-type->search-model entity-types)))
                        metabot-search-models)
        _ (log/infof "[METABOT-SEARCH] Converted entity-types %s to search-models %s" entity-types search-models)
        all-queries   (distinct (concat (or term-queries []) (or semantic-queries [])))
        metabot (t2/select-one :model/Metabot :entity_id (get-in metabot-v3.config/metabot-config [metabot-id :entity-id] metabot-id))
        use-verified-content? (if metabot-id
                                (:use_verified_content metabot)
                                false)
        search-fn (fn [query]
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
                                            :offset 0
                                            :search-native-query (boolean search-native-query)}
                                           (when use-verified-content?
                                             {:verified true})))
                          _ (log/infof "[METABOT-SEARCH] Search context models for query '%s': %s"
                                       query (:models search-context))
                          search-results (search/search search-context)
                          data (:data search-results)
                          result-models (frequencies (map :model data))]
                      (log/infof "[METABOT-SEARCH] Query '%s' returned entity types: %s" query result-models)
                      data))
        ;; Create futures for parallel execution
        futures (mapv #(future (search-fn %)) all-queries)
        result-lists (mapv deref futures)
        fused-results (reciprocal-rank-fusion result-lists)
        entity-type-counts (frequencies (map :model fused-results))
        transformed-results (map transform-search-result fused-results)]
    (log/infof "[METABOT-SEARCH] Entity type distribution: %s" entity-type-counts)
    (log/infof "[METABOT-SEARCH] Fused results sample (first 3): %s"
               (take 3 (map #(select-keys % [:id :model :name :table_name]) fused-results)))
    transformed-results))
