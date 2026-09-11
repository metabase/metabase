(ns metabase.dashboards.params
  "Pure parameter resolution over a Dashboard map. Kept out of [[metabase.dashboards.models.dashboard]] so the query
  processor can use it without depending on the Dashboard model."
  (:require
   [clojure.set :as set]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private ParamWithMapping
  [:map
   [:id ms/NonBlankString]
   [:name ms/NonBlankString]
   [:mappings [:maybe [:set ::parameters.schema/parameter-mapping-with-dashcard]]]])

(mu/defn dashboard->resolved-params :- [:map-of ms/NonBlankString ParamWithMapping]
  "Return map of Dashboard parameter key -> param with resolved `:mappings` (see the `:resolved-params` hydration
  in [[metabase.dashboards.models.dashboard]] for an example). Callers that only need the mappings (e.g. the QP) can
  pass slim dashcards instead of paying for the full hydration."
  [dashboard :- [:map
                 [:parameters [:maybe [:sequential :map]]]
                 [:dashcards [:maybe [:sequential [:map
                                                   [:parameter_mappings [:maybe [:sequential :map]]]]]]]]]
  (let [param-key->mappings (apply
                             merge-with set/union
                             (for [dashcard (:dashcards dashboard)
                                   param    (:parameter_mappings dashcard)]
                               {(:parameter_id param) #{(assoc param :dashcard dashcard)}}))]
    (into {} (for [{param-key :id, :as param} (:parameters dashboard)]
               [(u/qualified-name param-key) (assoc param :mappings (get param-key->mappings param-key))]))))
