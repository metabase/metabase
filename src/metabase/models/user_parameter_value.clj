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

(mu/defn upsert!
  "Upsert or delete parameter value set by the user."
  [user-id      :- ms/PositiveInt
   dashboard-id :- ms/PositiveInt
   parameter]
  (let [{:keys [value default] parameter-id :id} parameter]
    (if (or value default)
        (t2/with-transaction [_conn]
          (or (pos? (t2/update! :model/UserParameterValue {:user_id      user-id
                                                           :dashboard_id dashboard-id
                                                           :parameter_id parameter-id}
                                {:value value}))
              (t2/insert! :model/UserParameterValue {:user_id      user-id
                                                     :dashboard_id dashboard-id
                                                     :parameter_id parameter-id
                                                     :value        value})))
        (t2/delete! :model/UserParameterValue
                    :user_id      user-id
                    :dashboard_id dashboard-id
                    :parameter_id parameter-id))))

;; hydration

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :last_used_param_values]
  "Hydrate a map of parameter-id->last-used-value for the dashboards."
  [_model _k dashboards]
  (if-let [user-id api/*current-user-id*]
    (let [all-parameter-ids (into #{} (comp (mapcat :parameters) (map :id)) dashboards)
          last-used-values  (fn last-used-values [dashboard-id]
                              (when (seq all-parameter-ids)
                                (into {}
                                      (t2/select-fn-reducible
                                       (fn [{:keys [parameter_id value]}]
                                         [parameter_id value])
                                       :model/UserParameterValue
                                       :user_id user-id
                                       :dashboard_id dashboard-id
                                       :parameter_id [:in all-parameter-ids]))))]
      (map
       (fn [{dashboard-id :id :as dashboard}]
         (let [param-ids (mapv :id (:parameters dashboard))]
           (assoc dashboard :last_used_param_values (select-keys (last-used-values dashboard-id) param-ids)))) dashboards))
    dashboards))
