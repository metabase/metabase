(ns metabase-enterprise.metabot-v3.tools.search-data-sources
  "Tools for searching data sources in the Metabot v3 context."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [toucan2.core :as t2]))

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

(defn- build-search-context
  "Build the search context for a given search term"
  [term database-id search-models search-limit verified?]
  (search/search-context
   (cond-> {:search-string term
            :models (set search-models)
            :table-db-id database-id
            :current-user-id api/*current-user-id*
            :is-impersonated-user? (perms/impersonated-user?)
            :is-sandboxed-user? (perms/sandboxed-user?)
            :is-superuser? api/*is-superuser?*
            :current-user-perms @api/*current-user-permissions-set*
            :context :metabot
            :archived false
            :limit search-limit
            :offset 0}
     verified? (assoc :verified true))))

(defn- filter-by-collection
  "Filter search results by collection, always including tables"
  [metabot-coll-id results]
  (if metabot-coll-id
    (filter (fn [result]
              (or (= (:model result) "table")
                  (= (get-in result [:collection :id]) metabot-coll-id)))
            results)
    results))

(defn- dedupe-by-id-and-model
  "Remove duplicate results based on id and model"
  [results]
  (vals (m/index-by (juxt :id :model) results)))

(defn- search-for-term
  "Execute a search for a single term"
  [{:keys [term database-id search-models search-limit verified?]}]
  (-> (build-search-context term database-id search-models search-limit verified?)
      search/search
      :data))

(defn search-data-sources
  "Search for data sources (tables, models, cards, dashboards, metrics) in Metabase.
  Abstracted from the API endpoint logic."
  [{:keys [keywords description database-id entity-types limit metabot-id]}]
  (let [metabot-entity-id (get-in metabot-v3.config/metabot-config [metabot-id :entity-id] metabot-id)
        metabot (t2/select-one :model/Metabot :entity_id metabot-entity-id)
        metabot-coll-id (:collection_id metabot)

        normalized-description (when-not (str/blank? description) description)
        entity-types (if (seq entity-types)
                       entity-types
                       ["table" "model" "question" "dashboard" "metric"])

        search-terms (distinct (concat (or keywords []) (when normalized-description [normalized-description])))
        search-models (keep entity-type->search-model entity-types)
        search-limit (or limit (if metabot-coll-id 75 50))]
    (->> search-terms
         (mapcat #(search-for-term {:term %
                                    :database-id database-id
                                    :search-models search-models
                                    :search-limit search-limit
                                    :verified? (:use_verified_content metabot)}))
         (filter-by-collection metabot-coll-id)
         dedupe-by-id-and-model
         (map transform-search-result))))
