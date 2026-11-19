(ns metabase.dashboards.dependencies
  "The functions of the dependencies spec of a Dashboard."
  (:require
   [metabase.dependencies.core :as dependencies]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The Dashboards `dashboards` with their dashcards, each with its series."
  [dashboards]
  (t2/hydrate dashboards [:dashcards :series]))

(defn dependencies
  "The dependencies of the hydrated `dashboard`: the cards of its dashcards and their series, the cards its parameters
  take their values from, and the cards and dashboards its click behaviors link to."
  [{:keys [dashcards parameters]}]
  (let [links (apply dependencies/merge-dependencies
                     (map (comp dependencies/visualization-settings-dependencies :visualization_settings) dashcards))]
    {:card      (-> #{}
                    (into (keep :card_id) dashcards)
                    (into (comp (mapcat :series) (map :id)) dashcards)
                    (into (:card (dependencies/parameters-dependencies parameters)))
                    (into (:card links)))
     :dashboard (into #{} (:dashboard links))}))
