(ns metabase.visualizer.api
  "API endpoints for visualizer functionality including compatibility filtering."
  (:require
   [metabase.activity-feed.models.recent-views :as recent-views]
   [metabase.api.common :as api :refer [*current-user-id*]]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [metabase.visualizer.compat :as compat]))

(defn- transform-column-keys
  "Transform JS-style column keys to Clojure style for compatibility checking."
  [column]
  (-> column
      (update :base_type keyword)
      (update :semantic_type #(when % (keyword %)))))

(defn- filter-compatible-recents
  "Filter recent items based on visualizer compatibility."
  [recents current-display current-columns current-settings]
  (let [;; Transform columns to expected format
        transformed-columns (mapv transform-column-keys current-columns)]
    (filter
     (fn [item]
       (when-let [result-metadata (:result_metadata item)]
         ;; Transform metadata fields
         (let [transformed-fields (mapv transform-column-keys result-metadata)]
           (compat/compatible?
            {:current-display current-display
             :current-columns transformed-columns
             :current-settings current-settings
             :target-fields transformed-fields}))))
     recents)))

(api.macros/defendpoint :post "/compatible-recents"
  "Get recent items that are compatible with the current visualizer state.
   
   This endpoint filters results server-side based on visualization compatibility,
   reducing the amount of data sent to the client and improving performance."
  [_route-params
   _query-params
   {:keys [current_display current_columns current_settings]}
   :- [:map
       [:current_display [:maybe [:enum "bar" "line" "area" "scatter"]]]
       [:current_columns [:sequential :map]]
       [:current_settings :map]]]
  ;; Fetch all recents with metadata
  (let [all-recents (recent-views/get-recents *current-user-id* [:views]
                                              {:include-metadata? true})
        ;; Filter to only compatible items
        compatible-items (filter-compatible-recents
                          (:recents all-recents)
                          current_display
                          current_columns
                          current_settings)]
    {:recents compatible-items
     :total_count (count compatible-items)
     :filtered_from (count (:recents all-recents))}))