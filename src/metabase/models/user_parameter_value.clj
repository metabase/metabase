(ns metabase.models.user-parameter-value
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util.grouper :as grouper]
   [metabase.util.log :as log]
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

(defn batched-upsert!
  "Delete param with nil value and upsert the rest."
  [parameters]
  (let [{to-delete true
         to-upsert false} (group-by #(and (nil? (:value %)) (nil? (:default %))) parameters)]
    (t2/with-transaction [_conn]
      (doseq [item to-upsert]
        (or (pos? (t2/update! :model/UserParameterValue (select-keys item [:user_id :dashboard_id :parameter_id])
                              {:value (:value item)}))
            (t2/insert! :model/UserParameterValue (select-keys item [:user_id :dashboard_id :parameter_id :value]))))
      (when (seq to-delete)
        (t2/delete! :model/UserParameterValue {:where (into [:or] (for [p to-delete]
                                                                    [:and
                                                                     [:= :user_id (:user_id p)]
                                                                     [:= :dashboard_id (:dashboard_id p)]
                                                                     [:= :parameter_id (:parameter_id p)]]))})))))

(defonce ^:private user-parameter-value-queue
  (delay (grouper/start!
          (fn [inputs]
            (try
              (batched-upsert!
               (->> (for [input     inputs
                          parameter (:parameters input)]
                      {:user_id      (:user-id input)
                       :dashboard_id (:dashboard-id input)
                       :parameter_id (:id parameter)
                       :value        (:value parameter)
                       :default      (:default parameter)})
                    (m/distinct-by (juxt :user_id :dashboard_id :parameter_id))))
              (catch Exception e
                (log/error e "Error saving user parameters for a dashboard"))))
          :capacity 50
          :interval 100)))

(mu/defn store!
  "Asynchronously delete params with a nil `value` and upsert the rest."
  [user-id         :- ms/PositiveInt
   dashboard-id    :- ms/PositiveInt
   parameters      :- [:sequential :map]]
  (grouper/submit! @user-parameter-value-queue {:user-id      user-id
                                                :dashboard-id dashboard-id
                                                :parameters   parameters}))

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
     :id
     {:default {}})
    dashboards))
