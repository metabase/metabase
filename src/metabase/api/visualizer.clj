(ns metabase.api.visualizer
  "/api/card endpoints."
  (:require
   ;; Allowing search.config to be accessed for developer API to set weights
   ^{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.search.config :as search.config]
   [clojure.string :as str]
   [compojure.core :refer [DELETE GET POST PUT]]
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.models.recent-views :as recent-views]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.request.core :as request]
   [metabase.search.core :as search]
   [metabase.task :as task]
   [metabase.task.search-index :as task.search-index]
   [metabase.util :as util]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

#_
(api/defendpoint POST "/"
  "Create a new `Card`. Card `type` can be `question`, `metric`, or `model`."
  [:as {{:keys [collection_id collection_position dataset_query description display name
                parameters parameter_mappings result_metadata visualization_settings cache_ttl type], :as body} :body}]
  {name                   ms/NonBlankString
   type                   [:maybe ::card-type]
   dataset_query          ms/Map
   parameters             [:maybe [:sequential ms/Parameter]]
   parameter_mappings     [:maybe [:sequential ms/ParameterMapping]]
   description            [:maybe ms/NonBlankString]
   display                ms/NonBlankString
   visualization_settings ms/Map
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   result_metadata        [:maybe analyze/ResultsMetadata]
   cache_ttl              [:maybe ms/PositiveInt]}
  (check-if-card-can-be-saved dataset_query type)
  ;; check that we have permissions to run the query that we're trying to save
  (check-permissions-for-query dataset_query)
  ;; check that we have permissions for the collection we're trying to save this card to, if applicable
  (collection/check-write-perms-for-collection collection_id)
  (let [body (cond-> body
               (string? (:type body)) (update :type keyword))]
    (-> (card/create-card! body @api/*current-user*)
        hydrate-card-details
        (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))




;; The visualizer search endpoint should return
;; Cards, Datasets, and Metrics that are compatible with the current set of
;; data sources in the visualizer. So, for example, a source that has a timeseries column
;; being used in the visualizer should prompt the search endpoint to return Metrics/Cards/Datasets that
;; also contain a timeseries column

;; request cases
;; - empty request                     -> recents
;; - display only                      -> cards based on their result_metadata suitable for use in the display type
;; - display and columns but no search -> any metrics/cards/datasets that match the columns, by heuristics

(def DatasetColumn
  [:map
   [:id ms/PositiveInt]
   [:type ms/FieldTypeKeywordOrString]
   [:type ms/FieldSemanticTypeKeywordOrString]])

(api/defendpoint POST "/"
  "WIP Searches for data sources"
  [:as {{:keys [search display dataset-columns] :as body} :body}]
  (cond
    (every? nil? [search display dataset-columns])
    (->> (recent-views/get-recents api/*current-user-id*)
         :recents
         (take 2))



    ;; TODO: should probably add optional filters that are added when :visualization_settings and :result_metadata keys
    ;; exist, maybe?

    search
    (->> (search/search
          (search/search-context
           {:current-user-id             api/*current-user-id*
            :is-impersonated-user?       (premium-features/impersonated-user?)
            :is-sandboxed-user?          (premium-features/sandboxed-user?)
            :is-superuser?               api/*is-superuser?*
            :current-user-perms          @api/*current-user-permissions-set*
            :models                      #{"dataset" "metric" "card"} ;; should we search table too?
            :offset                      (request/offset)
            :limit                       (request/limit)
            :search-native-query         true
            :calculate-available-models? true
            :search-string               search}))
         :data
         (take 2))))



(defn asdf
  [{:keys [search display dataset-columns] :as body}]
  (let [types-set (into #{} (mapcat (fn [col]
                                      (vals (select-keys col [:base_type :effective_type :semantic_type])))
                                    dataset-columns))]
    (binding [api/*current-user-id* 1]
      (search/search
       (search/search-context
        {:current-user-id       api/*current-user-id*
         :is-impersonated-user? (premium-features/impersonated-user?)
         :is-sandboxed-user?    (premium-features/sandboxed-user?)
         :is-superuser?         api/*is-superuser?*
         :current-user-perms    @api/*current-user-permissions-set*
         :models                #{"dataset" "metric" "card"}
         :offset                (request/offset)
         :limit                 (request/limit)
         :search-native-query   true
         :search-string         (str/join " " (concat [search] (map util/qualified-name types-set)))
         #_#_:display           display
         :column-types          types-set
         :search-engine         "visualizer"})))))

(api/define-routes)











;; # What the Data Importer suggests to you if you select a chart type first:

;; The general rule is that:

;; - we want to show Metrics first when that makes sense,
;; - or Models if that makes more sense,
;; - followed by saved questions whose visualization type matches the selected chart type,
;; - then questions whose columns match what the viz “wants,”
;; - then other saved questions.

;; For each type of item in the importer, within that group of items, we should present first items that are in official collections and are verified, then things that are in official collections but not verified, then things in normal collections that are verified, then other things.

;; - E.g. for the very first bullet under Line and Area (Metrics with a primary time dimension), we’d first display metrics with a time dimension that are in an official collection and verified; then metrics with a time dimension that are in an official collection but not verified, and so on.

;; ## **Specifics for each visualization type**

;; - Gauge, Progress, Number
;;     1. Metrics
;;     2. Questions saved as Gauge, Progress, or Number, with questions exactly matching the selected chart type listed first
;;     3. Questions with a single row and single column
;;     4. Other saved questions
;;     5. Models
;; - Line, Area, Combo
;;     1. Metrics with a time dimension
;;     2. Metrics with any other categorical dimension
;;     3. Questions saved as Lines, Areas, or Combos
;;     4. Questions with two columns, where one column is numeric/an aggregation
;;     5. Unaggregated/SQL questions with +1 numeric column and 1+ datetime column
;;     6. Models
;;     7. Other saved questions
;; - Bar, Row, Waterfall, Combo
;;     1. Metrics with a primary categorical dimension
;;     2. Metrics with a time dimension
;;     3. Saved questions saved as Bars/Rows/Waterfall/Combo
;;     4. Saved questions with two columns, where one column is numeric/an aggregation
;;     5. Saved questions with three columns, where one column is numeric/an aggregation
;;     6. Models
;;     7. Other saved questions
;; - Trend
;;     1. Metrics with a time dimension
;;     2. Questions saved as Trends
;;     3. Questions with exactly one numeric column and one datetime column
;;     4. Questions with one numeric column and n datetime columns
;;     5. Models with 1+ numeric columns and 1+ datetime columns
;;     6. Saved Questions with 1+ numeric columns and 1+ datetime columns
;; - Pie, Funnel
;;     1. Metrics with a primary categorical dimension
;;     2. Metrics with a primary time dimension
;;     3. Questions saved as Pies/Funnels
;;     4. Questions with two columns, where one column is numeric/an aggregation
;;     5. Models
;;     6. Other saved questions
;;     - (Funnels in the future could also support scalar metrics/saved questions, but today we don’t support that for the actual `Funnel` chart type; only by using Add Data on dashcards.)
;; - Region Map
;;     1. Metrics with either a State or Country dimension
;;     2. Questions saved as a Region Map
;;     3. Models
;;     4. Other saved questions
;; - Pin Map
;;     1. Models with a Latitude and Longitude column
;;     2. Questions saved as Pin Map
;;     3. Questions that include a latitude and longitude column
;;     4. Metrics that have both a lat and long dimension?
;;     5. Other Models
;;     6. Other saved questions
;; - Table
;;     1. Models
;;     2. Questions saved as Tables
;;     3. Metrics
;;     4. Other saved questions
;; - Pivot Table
;;     1. Metrics
;;     2. Questions saved as Pivot Tables
;;     3. Models
;;     4. Other saved questions
;; - Scatterplots
;;     1. Models
;;     2. Metrics
;;     3. Questions saved as Scatterplots
;;     4. Other saved questions

;; Determining Compatibilities with just Result Metadata



;; SCALAR

;; result_metadata contains 1 column
;; the column's base_type, effective_type is Integer or BigInteger
;; the fingerprint, if it exists, has a [:global :distinct-count] of 1
;; the field_ref is an :aggregation -> will only work for Questions, not NATIVE, so maybe don't rely on this
;; semantic_type type/Quantity -> can be nil for a native Q, so can't rely on this entirely


;; so, steps to find all scalars:
;;  - maybe pre-filter with a string match for the types in result_metadata
;;  - parse result_metadata
;;  - if the entity matches the above, it's a valid result to pass to the FE



;; TIME SERIES
;; anything containing type/DateTime, or some temporal AND
;; at least 1 other column that's aggregated (if it's a question)
;; just other columns... we can't totally know if thigns are aggregated or now (in SQL case)
