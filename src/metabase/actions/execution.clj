(ns metabase.actions.execution
  (:require
    [clojure.tools.logging :as log]
    [medley.core :as m]
    [metabase.actions :as actions]
    [metabase.actions.http-action :as http-action]
    [metabase.api.common :as api]
    [metabase.mbql.normalize :as mbql.normalize]
    [metabase.models :refer [Card Dashboard DashboardCard ModelAction Table]]
    [metabase.models.action :as action]
    [metabase.models.query :as query]
    [metabase.query-processor.error-type :as qp.error-type]
    [metabase.query-processor.writeback :as qp.writeback]
    [metabase.shared.util.i18n :as i18n]
    [metabase.util :as u]
    [metabase.util.i18n :refer [tru]]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

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
      (qp.writeback/execute-write-query! query))
    (catch Throwable e
      (throw (ex-info (tru "Error executing Action: {0}" (ex-message e))
                      {:action     action
                       :parameters parameters}
                      e)))))

(defn- execute-http-action!
  [action parameters]
  (let [params->value (->> parameters
                           (map (juxt (comp second :target) :value))
                           (into {}))]
    (http-action/execute-http-action! action params->value)))

(defn- execute-custom-action [action-id parameters]
  (let [action (api/check-404 (first (action/select-actions :id action-id)))
        action-type (:type action)
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

(defn- implicit-action-table
  [card_id]
  (let [card (db/select-one Card :id card_id)
        {:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
    (hydrate (db/select-one Table :id table-id) :fields)))

(defn- execute-implicit-action
  [{:keys [card_id slug requires_pk] :as _model-action} parameters]
  (let [{database-id :db_id table-id :id :as table} (implicit-action-table card_id)
        {pk-fields true} (group-by #(isa? (:semantic-type %) :type/PK) (:fields table))
        _ (api/check (<= (count pk-fields) 1) 400 (i18n/tru "Cannot execute implicit action on a table with multiple primary keys."))
        pk-field (first pk-fields)
        simple-parameters (dissoc (into {} (map (juxt :id :value)) parameters) (:name pk-field))
        query (cond-> {:database database-id,
                       :type :query,
                       :query {:source-table table-id}}
                requires_pk
                (assoc-in [:query :filter]
                          [:= [:field (:id pk-field) nil] (get simple-parameters (:name pk-field))]))
        implicit-action (cond
                          (= slug "delete")
                          :row/delete

                          requires_pk
                          :row/update

                          :else
                          :row/create)
        arg-map (cond-> query
                  (= implicit-action :row/create)
                  (assoc :create-row simple-parameters)

                  (= implicit-action :row/update)
                  (assoc :update-row simple-parameters))]
    (actions/perform-action! implicit-action arg-map)))

(defn execute-dashcard!
  "Execute the given action in the dashboard/dashcard context with the given unmapped-parameters and extra-parameters.
   See [[map-parameters]] for a description of their expected shapes."
  [dashboard-id dashcard-id slug unmapped-parameters extra-parameters]
  (api/check-superuser)
  (actions/check-actions-enabled)
  (api/read-check Dashboard dashboard-id)
  (let [dashcard (api/check-404 (db/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        model-action (api/check-404 (db/select-one ModelAction :card_id (:card_id dashcard) :slug slug))
        _ (log/tracef "Mapping parameters\n\n%s\nwith mappings\n\n%s"
                      (u/pprint-to-str unmapped-parameters)
                      (u/pprint-to-str (:parameter_mappings dashcard)))
        mapped-parameters (map-parameters
                            (mbql.normalize/normalize-fragment [:parameters] unmapped-parameters)
                            (:parameter_mappings dashcard))
        parameters (into (mbql.normalize/normalize-fragment [:parameters] extra-parameters)
                         mapped-parameters)]
    (if-let [action-id (:action_id model-action)]
      (execute-custom-action action-id parameters)
      (execute-implicit-action model-action parameters))))

(defn execution-parameters
  "Return the available parameters for executing the referenced action"
  [dashboard-id dashcard-id slug]
  (actions/check-actions-enabled)
  (api/read-check Dashboard dashboard-id)
  (let [dashcard (api/check-404 (db/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        model-action (api/check-404 (db/select-one ModelAction :card_id (:card_id dashcard) :slug slug))]
    (if-let [action-id (:action_id model-action)]
      (let [action (api/check-404 (first (action/select-actions :id action-id)))]
        (:parameters action))
      (let [table (implicit-action-table (:card_id model-action))]
        (for [field (:fields table)]
          {:id (:name field)
           :target [:dimension [:field (:id field) nil]]
           :type (:base_type field)})))))
