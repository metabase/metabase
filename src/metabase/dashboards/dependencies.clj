(ns metabase.dashboards.dependencies
  "The functions of the dependencies spec of a Dashboard."
  (:require
   [metabase.dependencies.core :as dependencies]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.visualization-settings.dynamic-goals :as dynamic-goals]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The Dashboards `dashboards` with their dashcards, each with its series."
  [dashboards]
  (t2/hydrate dashboards [:dashcards :series]))

(defn dependencies
  "The dependencies of the hydrated `dashboard`: the cards of its dashcards and their series, the cards its parameters
  take their values from, the cards and dashboards its click behaviors link to, and the entities the dynamic goals of
  its dashcards read."
  [{:keys [dashcards parameters]}]
  (let [links (apply dependencies/merge-dependencies
                     (map (comp dependencies/visualization-settings-dependencies :visualization_settings) dashcards))
        goals (apply dependencies/merge-dependencies
                     (map #(dynamic-goals/goal-dependencies
                            (lib/normalize ::lib.schema.visualization/visualization-settings (:visualization_settings %)))
                          dashcards))]
    (dependencies/merge-dependencies
     {:card      (-> #{}
                     (into (keep :card_id) dashcards)
                     (into (comp (mapcat :series) (map :id)) dashcards)
                     (into (:card (dependencies/parameters-dependencies parameters)))
                     (into (:card links)))
      :dashboard (into #{} (:dashboard links))}
     goals)))
