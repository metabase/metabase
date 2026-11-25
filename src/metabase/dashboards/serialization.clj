(ns metabase.dashboards.serialization
  "The SerDes of Dashboards and their dashcards."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(def dashboard-tab-id-transform
  "The transform of the `dashboard_tab_id` of dashcards, which imports the tab an older export names by its
  `[dashboard-eid tab-eid]` too."
  (update (serialization/fk-transform :model/DashboardTab) :import
          (fn [import-ids]
            (fn [store batch refs opts]
              (import-ids store batch (map serialization/owned-entity-id refs) opts)))))

(def ^:private export-walkers
  "The dependency walkers for Dashboard rows with database ids."
  {:mbql                   serialization/export-mbql-dependencies
   :parameters             serialization/export-parameters-dependencies
   :visualization-settings serialization/export-visualization-settings-dependencies})

(def ^:private import-walkers
  "The dependency walkers for Dashboard entities, which hold references."
  {:mbql                   serialization/import-mbql-dependencies
   :parameters             serialization/import-parameters-dependencies
   :visualization-settings serialization/import-visualization-settings-dependencies})

(defn- dashcard-dependencies
  "The dependencies of a dashcard, found with the `walkers` of [[export-walkers]] or [[import-walkers]]."
  [{:keys [action_id card_id parameter_mappings visualization_settings series]} {:keys [mbql visualization-settings]}]
  (set
   (concat
    (mapcat mbql parameter_mappings)
    (visualization-settings visualization_settings)
    (when card_id   #{[:model/Card card_id]})
    (when action_id #{[:model/Action action_id]})
    (for [s series] [:model/Card (:card_id s)]))))

(defn- dashboard-dependencies
  "The dependencies of a Dashboard with its `:dashcards` and their `:series`, found with `walkers`."
  [dashboard {:keys [parameters] :as walkers}]
  (->> (map #(dashcard-dependencies % walkers) (:dashcards dashboard))
       (reduce set/union #{})
       (set/union (when-let [id (:collection_id dashboard)] #{[:model/Collection id]}))
       (set/union (parameters (:parameters dashboard)))))

(defn- export-dashboard-dependencies
  "The `[model id]` dependencies of a Dashboard row with its `:dashcards` and their `:series`."
  [dashboard]
  (dashboard-dependencies dashboard export-walkers))

(defn- import-dashboard-dependencies
  "The `[model ref]` dependencies of a Dashboard entity."
  [dashboard]
  (dashboard-dependencies dashboard import-walkers))

(defn import-dependencies
  "The `[model ref]` dependencies of each of the Dashboard `entities`."
  [entities]
  (mapv import-dashboard-dependencies entities))

(defn- dashcards-with-series
  "The map from Dashboard id to the dashcards of the Dashboards with `dashboard-ids`, each with its `:series`."
  [dashboard-ids]
  (let [dashcards (when (seq dashboard-ids) (dashboards.db/dashcards-serdes-columns (vec dashboard-ids)))
        series    (group-by :dashboardcard_id (when (seq dashcards)
                                                (dashboards.db/dashcard-series-columns (mapv :id dashcards))))]
    (group-by :dashboard_id (map #(assoc % :series (get series (:id %))) dashcards))))

(defn export-dependencies
  "The `[model id]` dependencies of each of the `dashboards`, rows, with those of their dashcards."
  [dashboards]
  (let [dashcards (dashcards-with-series (keep :id dashboards))]
    (mapv #(export-dashboard-dependencies (assoc % :dashcards (get dashcards (:id %)))) dashboards)))

(defn before-load
  "The Dashboard load `items` without the dashcards of Actions that are not loaded."
  [items]
  (let [action-eids    (into #{} (comp (mapcat (comp :dashcards :entity)) (keep :action_id)) items)
        loaded         (if (seq action-eids) (dashboards.db/action-entity-ids-in action-eids) #{})
        keep-dashcard? #(or (nil? (:action_id %)) (contains? loaded (:action_id %)))]
    (mapv #(m/update-existing-in % [:entity :dashcards] (partial filterv keep-dashcard?)) items)))
