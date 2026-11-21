(ns metabase.users.models.user-parameter-value
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.batch-processing.core :as grouper]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.users.db :as users.db]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
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
      (json/decode+kw s)
      (catch Throwable _e
        s))
    s))

(t2/deftransforms :model/UserParameterValue
  {:value {:in  mi/json-in
           :out json-out}})

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :last_used_param_values]
  "Hydrate a map of parameter-id->last-used-value for the dashboards."
  [_model _k dashboards]
  (if-let [user-id (and (setting/get :dashboards-save-last-used-parameters) api/*current-user-id*)]
    (mi/instances-with-hydrated-data
     dashboards
     :last_used_param_values
     (fn [] ;; return a map of {dashboard-id {parameter-id value}}
       (let [upvs (users.db/user-parameter-values-for-dashboards user-id (map :id dashboards))]
         (as-> upvs result
           (group-by :dashboard_id result)
           (update-vals result (fn [upvs]
                                 (into {}
                                       (map (juxt :parameter_id :value) upvs)))))))
     :id
     {:default {}})
    dashboards))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn upsert-user-parameter-values!
  "Delete the stored values of `parameters` and store again those with a value or a default."
  [parameters :- [:sequential [:map
                               [:user_id      pos-int?]
                               [:dashboard_id pos-int?]
                               [:parameter_id :string]
                               [:value        [:maybe [:ref :metabase.lib.schema.parameter/parameter.value]]]
                               [:default      [:maybe [:ref :metabase.lib.schema.parameter/parameter.value]]]]]]
  (when (setting/get :dashboards-save-last-used-parameters)
    (let [to-insert (remove #(and (nil? (:value %)) (nil? (:default %))) parameters)]
      (t2/with-transaction [_conn]
        (doseq [batch (partition-all 1000 parameters)]
          (users.db/delete-user-parameter-values! (map #(select-keys % [:user_id :dashboard_id :parameter_id]) batch)))
        (doseq [batch (partition-all 1000 to-insert)]
          (users.db/insert-user-parameter-values! (map #(select-keys % [:user_id :dashboard_id :parameter_id :value]) batch)))))))

(defn- update-user-parameter-values* [inputs]
  (try
    (upsert-user-parameter-values!
     (->> (for [input     inputs
                parameter (:parameters input)]
            {:user_id      (:user-id input)
             :dashboard_id (:dashboard-id input)
             :parameter_id (:id parameter)
             :value        (:value parameter)
             :default      (:default parameter)})
          (m/index-by (juxt :user_id :dashboard_id :parameter_id))
          vals))
    (catch Exception e
      (log/errorf "Error saving user parameters for a dashboard: %s" (ex-message e)))))

(defonce ^:private user-parameter-value-queue
  (delay (grouper/start!
          #'update-user-parameter-values*
          :capacity 5000
          :interval 5000)))

(mu/defn store!
  "Asynchronously delete params with a nil `value` and upsert the rest."
  [user-id         :- pos-int?
   dashboard-id    :- pos-int?
   parameters      :- [:sequential :metabase.parameters.schema/parameter-with-stored-value]]
  (when (setting/get :dashboards-save-last-used-parameters)
    (grouper/submit! @user-parameter-value-queue {:user-id      user-id
                                                  :dashboard-id dashboard-id
                                                  :parameters   parameters})))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/UserParameterValue [_model]
  {:skip? false})
