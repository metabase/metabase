(ns metabase.api.visualizer
  "/api/card endpoints."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.request.core :as request]
   [metabase.search.core :as search]))

(set! *warn-on-reflection* true)

;; The visualizer search endpoint should return
;; Cards, Datasets, and Metrics that are compatible with the current set of
;; data sources in the visualizer. So, for example, a source that has a timeseries column
;; being used in the visualizer should prompt the search endpoint to return Metrics/Cards/Datasets that
;; also contain a timeseries column

;; request cases
;; - empty request                     -> recents
;; - display only                      -> cards based on their result_metadata suitable for use with the display type
;; - display and columns but no search -> any metrics/cards/datasets that match the columns, by heuristics

#_(def DatasetColumn
    [:map
     [:id ms/PositiveInt]
     [:base_type ms/FieldTypeKeywordOrString]
     [:effective_type ms/FieldTypeKeywordOrString]
     [:semantic_type ms/FieldSemanticTypeKeywordOrString]])

(api/defendpoint POST "/"
  "Endpoint powering the Visualizer search."
  [:as {{:keys [search display dataset-columns]} :body}]
  (let [types-set (into #{} (mapcat (fn [col]
                                      (mapv keyword (vals (select-keys col [:base_type :effective_type :semantic_type]))))
                                    dataset-columns))]
    (->> (search/search
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
            :search-string         search
            :compatibility         {:display      display
                                    :column-types types-set
                                    :column-count (count dataset-columns)}
            :search-engine         "visualizer"}))
         :data)))

(api/define-routes)
