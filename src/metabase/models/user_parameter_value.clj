(ns metabase.models.user-parameter-value
  (:require
   [cheshire.core :as json]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/UserParameterValue [_model] :user_parameter_value)

(doto :model/UserParameterValue
  (derive :metabase/model))

(defn- json-out
  "A version of `metabase.models.interface/json-out` that does not log a parse error.
  This is otherwise the same. It returns the string as expected in this case."
  [s]
  (if (string? s)
    (try
      (json/parse-string s true)
      (catch Throwable _e
        s))
    s))

(t2/deftransforms :model/UserParameterValue
  {:value {:in  mi/json-in
           :out json-out}})

(mu/defn batched-upsert!
  "Delete param with nil value and upsert the rest."
  [user-id         :- ms/PositiveInt
   dashboard-id    :- ms/PositiveInt
   param-id->value :- [:map-of :string :any]]
  (let [to-delete (filter (comp nil? second) param-id->value)
        to-upsert (filter (comp some? second) param-id->value)]
    (t2/with-transaction [_conn]
      (t2/query {:insert-into :user_parameter_value
                 :values      (map (fn [[param-id value]]
                                     {:user_id      user-id
                                      :dashboard_id dashboard-id
                                      :parameter_id param-id
                                      :value        value})
                                   to-upsert)
                 :on-conflict  [:user_id :dashboard_id :parameter_id]
                 :do-update-set :value})
      (when (seq to-delete)
        (t2/delete! :model/UserParameterValue
                    :user_id user-id
                    :dashboard_id dashboard-id
                    :parameter_id [:in (map first to-delete)])))))

;; hydration

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :last_used_param_values]
  "Hydrate a map of parameter-id->last-used-value for the dashboards."
  [_model _k dashboards]
  (if-let [user-id api/*current-user-id*]
    (mi/instances-with-hydrated-data
     dashboards
     :last_used_param_values
     (fn [] ;; return a map of {dashboard-id {parameter-id value}}
       (let [upvs (t2/select :model/UserParameterValue
                             :dashboard_id [:in (map :id dashboards)]
                             :user_id user-id)]
         (as-> upvs result
           (group-by :dashboard_id result)
           (update-vals result (fn [upvs]
                                 (into {}
                                       (map (juxt :parameter_id :value) upvs)))))))
     :id)
    dashboards))
