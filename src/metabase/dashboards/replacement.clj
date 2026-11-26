(ns metabase.dashboards.replacement
  "The functions of the replacement spec of a Dashboard, whose writes include those of its dashcards."
  (:require
   [medley.core :as m]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.replacement.core :as replacement]
   [metabase.replacement.walk :as replacement.walk]))

(set! *warn-on-reflection* true)

(defn- dashcard-card-ids
  "The ids of the cards that the parameter mappings and click behaviors of `dashcard` target."
  [dashcard]
  (concat
   (replacement.walk/parameter-mapping-card-ids (:parameter_mappings dashcard))
   (replacement.walk/viz-settings-click-behavior-card-ids (:visualization_settings dashcard))))

(defn- hydrate-one
  "The `dashboard` with its dashcards under `:replacement/dashcards` and, under `:replacement/cards` by id, the cards
  that its parameters take their values from and that its dashcards target."
  [dashboard]
  (let [dashcards (dashboards.db/dashcards (:id dashboard))
        card-ids  (into (replacement.walk/parameter-source-card-ids (or (:parameters dashboard) []))
                        (mapcat dashcard-card-ids)
                        dashcards)]
    (assoc dashboard
           :replacement/dashcards dashcards
           :replacement/cards     (if (seq card-ids)
                                    (m/index-by :id (dashboards.db/cards-by-ids (vec card-ids)))
                                    {}))))

(defn hydrate
  "The Dashboards `dashboards`, each with its dashcards and the cards they and its parameters reference."
  [dashboards]
  (mapv hydrate-one dashboards))

(defn- dashcard-writes
  "The write of the dashcard whose parameter mapping and click behavior targets `target-fn` of a target and a card id
  updates, or none."
  [dashcard target-fn]
  (let [parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (replacement.walk/walk-parameter-mapping-targets parameter-mappings target-fn)
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    (replacement.walk/walk-viz-settings-click-behaviors target-fn))
        changes             (cond-> {}
                              (not= parameter-mappings parameter-mappings')
                              (assoc :parameter_mappings parameter-mappings')
                              (not= viz-settings viz-settings')
                              (assoc :visualization_settings viz-settings'))]
    (if (seq changes)
      [[:model/DashboardCard (:id dashcard) changes]]
      [])))

(defn- dashboard-writes
  "The write of `parameters'` to `dashboard` when they differ from its `parameters`, or none."
  [dashboard parameters parameters']
  (if (not= parameters parameters')
    [[:model/Dashboard (:id dashboard) {:parameters parameters'}]]
    []))

(defn upgrade-field-refs
  "The writes that upgrade the field refs of the hydrated `dashboard` in its parameters, then in the parameter
  mappings and click behaviors of its dashcards."
  [dashboard]
  (let [card-id->card (:replacement/cards dashboard)
        parameters    (or (:parameters dashboard) [])
        parameters'   (replacement/upgrade-parameter-source-card-refs parameters card-id->card)]
    (into (dashboard-writes dashboard parameters parameters')
          (mapcat #(dashcard-writes % (fn [target card-id]
                                        (replacement/upgrade-parameter-target target card-id card-id->card))))
          (:replacement/dashcards dashboard))))

(defn swap-source
  "The writes that swap `old-source` for `new-source` in the parameter mappings and click behaviors of the dashcards
  of the hydrated `dashboard`, then in the cards its parameters take their values from."
  [dashboard old-source new-source]
  (let [card-id->card (:replacement/cards dashboard)
        parameters    (or (:parameters dashboard) [])
        parameters'   (replacement/swap-parameter-source-card-id parameters old-source new-source)]
    (-> []
        (into (mapcat #(dashcard-writes % (fn [target card-id]
                                            (replacement/swap-parameter-target target card-id card-id->card
                                                                               old-source new-source))))
              (:replacement/dashcards dashboard))
        (into (dashboard-writes dashboard parameters parameters')))))
