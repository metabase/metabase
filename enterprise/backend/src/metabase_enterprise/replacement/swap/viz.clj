(ns metabase-enterprise.replacement.swap.viz
  (:require
   [clojure.walk]
   [metabase.lib-be.source-swap :as lib-be.source-swap]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- swap-parameter-mapping
  [parameter-mapping field-id-mapping]
  (update parameter-mapping :target lib-be.source-swap/swap-source-in-parameter-target field-id-mapping))

(defn- swap-column-settings-field-refs
  [column-settings field-id-mapping]
  (clojure.walk/postwalk
   (fn [form]
     ;; some forms don't get converted to keywords, so hack it
     (if (and (vector? form)
              (= "dimension" (first form)))
       (try
         (let [dim (-> form
                       (update 0 keyword)
                       (update-in [1 0] keyword)
                       (update-in [1 2 :base-type] keyword))]
           (lib-be.source-swap/swap-source-in-parameter-target dim field-id-mapping))
         (catch Exception e
           (log/tracef e "Could not swap field refs in column_settings dimension: %s" (pr-str form))
           form))
       form))
   column-settings))

(defn- update-dashcard-field-refs!
  [dashcard field-id-mapping]
  (let [viz      (vs/db->norm (:visualization_settings dashcard))
        viz'     (update viz ::vs/column-settings swap-column-settings-field-refs field-id-mapping)
        parameter-mappings (:parameter_mappings dashcard)
        parameter-mappings' (mapv #(swap-parameter-mapping % field-id-mapping) parameter-mappings)
        changes (cond-> {}
                  (not= viz viz')
                  (assoc :visualization_settings (vs/norm->db viz'))

                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings'))]
    (when (seq changes)
      (t2/update! :model/DashboardCard (:id dashcard) changes))))

(defn dashboard-card-update-field-refs!
  "After a card's query has been updated, swap the field refs in parameter_mappings
  and column_settings on all DashboardCards that display this card."
  [card-id field-id-mapping]
  (when (some? field-id-mapping)
    (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
      (update-dashcard-field-refs! dashcard field-id-mapping))))

(defn dashboard-update-field-refs!
  "Swap field refs in parameter_mappings and column_settings on all DashboardCards
  in the given dashboard. Skips dashcards whose card_id is in `exclude-card-ids`
  (those were already processed by [[dashboard-card-update-field-refs!]])."
  [dashboard-id field-id-mapping exclude-card-ids]
  (when (some? field-id-mapping)
    (doseq [dashcard (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            :when (not (contains? exclude-card-ids (:card_id dashcard)))]
      (update-dashcard-field-refs! dashcard field-id-mapping))))
