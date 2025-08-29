(ns metabase-enterprise.metabot-v3.tools.search-data-sources
  "Tools for searching data sources in the Metabot v3 context."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]))

(def ^:private entity-type->search-model
  "Maps API entity types to search engine model types"
  {"table" "table"
   "model" "dataset"
   "question" "card"
   "dashboard" "dashboard"
   "metric" "metric"})

(def ^:private search-model->result-type
  "Maps search engine model types to result types"
  {"dashboard" :dashboard
   "table" :table
   "dataset" :model
   "card" :question
   "metric" :metric})

(defn transform-search-result
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
      {:id (:id result)
       :type result-type
       :name (:table_name result)           ; Technical table name for tables
       :display_name (:name result)
       :description (:description result)
       :database_id (:database_id result)
       :database_schema (:table_schema result)}

      "dataset"  ; Models
      {:id (:id result)
       :type result-type
       :name (:name result)                 ; Use the display name here as well since there is no technical name
       :display_name (:name result)
       :description (:description result)
       :database_id (:database_id result)
       :verified (boolean (:verified result))}  ;; Fallback to False if not provided

      ;; For dashboards, questions, and metrics:
      {:id (:id result)
       :type result-type
       :name (:name result)                 ; Display name
       :description (:description result)
       :verified (boolean (or (:verified result)  ; Fallback to False if not provided
                              (= "verified" (:moderated_status result))))})))

(defn search-data-sources
  "Search for data sources (tables, models, cards, dashboards, metrics) in Metabase.
  Abstracted from the API endpoint logic."
  [{:keys [keywords description database-id entity-types limit] :as arguments}]
  (let [;; Default to all entity types if none specified
        entity-types (if (seq entity-types)
                       entity-types
                       ["table" "model" "question" "dashboard" "metric"])
        normalized-description (if (and (string? description) (str/blank? description)) nil description)
        search-terms (distinct (concat (or keywords []) (when normalized-description [normalized-description])))
        search-models (set (keep entity-type->search-model entity-types))
        ;; Run a search for each term in the search terms
        all-results (mapcat
                     (fn [term]
                       (let [search-context (search/search-context
                                             {:search-string term
                                              :models search-models
                                              :table-db-id database-id
                                              ;;TODO: Do we need those impersonated, sandboxed, superuser checks?
                                              :current-user-id api/*current-user-id*
                                              :is-impersonated-user? (perms/impersonated-user?)
                                              :is-sandboxed-user? (perms/sandboxed-user?)
                                              :is-superuser? api/*is-superuser?*
                                              :current-user-perms @api/*current-user-permissions-set*
                                              :context :default ; TODO: Does this need to be a specific Metabot context maybe?
                                              :archived false
                                              :limit (or limit 50)
                                              :offset 0})
                             search-results (search/search search-context)]
                         (:data search-results)))
                     search-terms)
        unique-results (vals (m/index-by (juxt :id :model) all-results))]
    (map transform-search-result unique-results)))
