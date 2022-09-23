(ns metabase.actions.execution
  (:require
    [clojure.tools.logging :as log]
    [medley.core :as m]
    [metabase.actions :as actions]
    [metabase.actions.http-action :as http-action]
    [metabase.api.common :as api]
    [metabase.mbql.normalize :as mbql.normalize]
    [metabase.models :refer [Dashboard DashboardCard]]
    [metabase.models.action :as action]
    [metabase.query-processor.error-type :as qp.error-type]
    [metabase.query-processor.middleware.permissions :as qp.perms]
    [metabase.query-processor.writeback :as qp.writeback]
    [metabase.util :as u]
    [metabase.util.i18n :refer [tru]]
    [toucan.db :as db]))

(defn- map-parameters
  "Take the `parameters` map passed in to an endpoint and map it to the parameters
  in the underlying `Action` so they can be attached to the query that gets passed to
   [[qp/execute-write-query!]] or [[execute-http-action!]].

  Incoming API request `:parameters` should look like

    [{:id \"my_id\",
      :type \"id\",
      :value \"12\"}]

  And `parameter_mappings` should look like

     [{:parameter_id \"my_id\", :target [:variable [:template-tag \"id\"]]}]

  We need to convert these to a list like

    [{:id \"my_id\"
      :type \"id\"
      :target [:variable [:template-tag \"id\"]]
      :value  \"12\"}]

  before passing to the QP code."
  [parameters parameter-mappings]
  (let [mappings-by-id (m/index-by :parameter_id parameter-mappings)]
    (mapv (fn [{param-id :id :as parameter}]
            (let [target (or (get-in mappings-by-id [param-id :target])
                             (throw (ex-info (tru "No parameter mapping found for parameter {0}. Found: {1}"
                                                  (pr-str param-id)
                                                  (pr-str (set (map :parameter_id parameter-mappings))))
                                             {:status-code 400
                                              :type        qp.error-type/invalid-parameter
                                              :parameters  parameters
                                              :mappings    parameter-mappings})))]
              (assoc parameter :target target)))
          parameters)))

(defn- execute-query-action!
  "Execute a `QueryAction` with parameters as passed in from an
  endpoint (see [[map-parameters]] for a description of their shape).

  `action` should already be hydrated with its `:card`."
  [{:keys [card] action-id :id :as action} parameters]
  (when-not card
    (throw (ex-info (tru "No Card found for Action {0}." action-id)
                    {:status-code 400, :action action})))
  (when-not (:is_write card)
    (throw (ex-info (tru "Cannot execute Action {0}: Card {1} is not marked as `is_write`"
                         action-id
                         (:id card))
                    {:status-code 400, :action action})))
  (log/tracef "Executing action\n\n%s" (u/pprint-to-str action))
  (try
    (let [query (assoc (:dataset_query card) :parameters parameters)]
      (log/debugf "Query (before preprocessing):\n\n%s" (u/pprint-to-str query))
      (binding [qp.perms/*card-id* (:id card)]
        (qp.writeback/execute-write-query! query)))
    (catch Throwable e
      (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
        (api/throw-403 e)
        (throw (ex-info (tru "Error executing Action: {0}" (ex-message e))
           {:action     action
            :parameters parameters}
           e))))))

(defn- execute-http-action!
  [action parameters]
  (let [params->value (->> parameters
                           (map (juxt (comp second :target) :value))
                           (into {}))]
    (http-action/execute-http-action! action params->value)))

(defn execute-dashcard!
  "Execute the given action in the dashboard/dashcard context with the given unmapped-parameters and extra-parameters.
   See [[map-parameters]] for a description of their expected shapes."
  [dashboard-id dashcard-id unmapped-parameters extra-parameters]
  (actions/check-actions-enabled)
  (api/read-check Dashboard dashboard-id)
  (let [dashcard (api/check-404 (db/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        action (api/check-404 (first (action/select-actions :id (:action_id dashcard))))
        action-type (:type action)
        _ (log/tracef "Mapping parameters\n\n%s\nwith mappings\n\n%s"
                      (u/pprint-to-str unmapped-parameters)
                      (u/pprint-to-str (:parameter_mappings dashcard)))
        mapped-parameters (map-parameters
                            (mbql.normalize/normalize-fragment [:parameters] unmapped-parameters)
                            (:parameter_mappings dashcard))
        parameters (into (mbql.normalize/normalize-fragment [:parameters] extra-parameters)
                         mapped-parameters)
        destination-parameters-by-target (m/index-by :target (:parameters action))]
    (doseq [{:keys [target]} parameters]
      (when-not (contains? destination-parameters-by-target target)
        (throw (ex-info (tru "No destination parameter found for target {0}. Found: {1}"
                             (pr-str target)
                             (pr-str (set (keys destination-parameters-by-target))))
                        {:status-code 400
                         :type qp.error-type/invalid-parameter
                         :parameters parameters
                         :destination-parameters (:parameters action)}))))
    (case action-type
      :query
      (execute-query-action! action parameters)

      :http
      (execute-http-action! action parameters)

      (throw (ex-info (tru "Unknown action type {0}." (name action-type)) action)))))
