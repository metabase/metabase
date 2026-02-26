(ns metabase-enterprise.replacement.swap.viz
  (:require
   [clojure.walk]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.source-swap :as lib-be.source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- swap-parameter-mapping
  [parameter-mapping query old-source new-source]
  (update parameter-mapping :target lib-be.source-swap/swap-source-in-parameter-target query old-source new-source))

(defn- swap-column-settings-field-refs
  [column-settings query old-source new-source]
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
           (lib-be.source-swap/swap-source-in-parameter-target query dim old-source new-source))
         (catch Exception e
           (log/tracef e "Could not swap field refs in column_settings dimension: %s" (pr-str form))
           form))
       form))
   column-settings))

(defn- update-dashcard-field-refs!
  [dashcard query old-source new-source]
  (let [viz      (vs/db->norm (:visualization_settings dashcard))
        viz'     (update viz ::vs/column-settings swap-column-settings-field-refs query old-source new-source)
        parameter-mappings (:parameter_mappings dashcard)
        parameter-mappings' (mapv #(swap-parameter-mapping % query old-source new-source) parameter-mappings)
        changes (cond-> {}
                  (not= viz viz')
                  (assoc :visualization_settings (vs/norm->db viz'))

                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings'))]
    (when (seq changes)
      (t2/update! :model/DashboardCard (:id dashcard) changes))))

(defn- dashcard-query
  "Build a pMBQL query for the card displayed by `dashcard`."
  [dashcard]
  (when-let [card-id (:card_id dashcard)]
    (when-let [card (t2/select-one :model/Card :id card-id)]
      (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
        (lib/query mp (lib.metadata/card mp card-id))))))

(defn dashboard-card-update-field-refs!
  "After a card's query has been updated, swap the field refs in parameter_mappings
  and column_settings on all DashboardCards that display this card."
  [card-id old-source new-source]
  (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
    (when-let [query (dashcard-query dashcard)]
      (update-dashcard-field-refs! dashcard query old-source new-source))))

(defn dashboard-update-field-refs!
  "Swap field refs in parameter_mappings and column_settings on all DashboardCards
  in the given dashboard. Skips dashcards whose card_id is in `exclude-card-ids`
  (those were already processed by [[dashboard-card-update-field-refs!]])."
  [dashboard-id old-source new-source exclude-card-ids]
  (doseq [dashcard (t2/select :model/DashboardCard :dashboard_id dashboard-id)
          :when (not (contains? exclude-card-ids (:card_id dashcard)))]
    (when-let [query (dashcard-query dashcard)]
      (update-dashcard-field-refs! dashcard query old-source new-source))))
