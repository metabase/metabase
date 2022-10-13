(ns metabase.actions.execution
  (:require
    [clojure.set :as set]
    [clojure.tools.logging :as log]
    [medley.core :as m]
    [metabase.actions :as actions]
    [metabase.actions.http-action :as http-action]
    [metabase.api.common :as api]
    [metabase.models :refer [Card Dashboard DashboardCard ModelAction Table]]
    [metabase.models.action :as action]
    [metabase.models.query :as query]
    [metabase.query-processor.error-type :as qp.error-type]
    [metabase.query-processor.middleware.permissions :as qp.perms]
    [metabase.query-processor.writeback :as qp.writeback]
    [metabase.util :as u]
    [metabase.util.i18n :refer [tru]]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(defn- execute-query-action!
  "Execute a `QueryAction` with parameters as passed in from an
  endpoint of shape `{<parameter-id> <value>}`.

  `action` should already be hydrated with its `:card`."
  [{:keys [card] action-id :id :as action} request-parameters]
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
    (let [parameters (for [parameter (:parameters action)]
                       (assoc parameter :value (get request-parameters (:id parameter))))
          query (assoc (:dataset_query card) :parameters parameters)]
      (log/debugf "Query (before preprocessing):\n\n%s" (u/pprint-to-str query))
      (binding [qp.perms/*card-id* (:id card)]
        (qp.writeback/execute-write-query! query)))
    (catch Throwable e
      (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
        (api/throw-403 e)
        (throw (ex-info (tru "Error executing Action: {0}" (ex-message e))
           {:action     action
            :parameters request-parameters}
           e))))))

(defn- execute-custom-action [action-id request-parameters]
  (let [action (api/check-404 (first (action/select-actions :id action-id)))
        action-type (:type action)
        destination-parameters-by-id (m/index-by :id (:parameters action))]
    (doseq [[parameter-id _value] request-parameters]
      (when-not (contains? destination-parameters-by-id parameter-id)
        (throw (ex-info (tru "No destination parameter found for id {0}. Found: {1}"
                             (pr-str parameter-id)
                             (pr-str (set (keys destination-parameters-by-id))))
                        {:status-code 400
                         :type qp.error-type/invalid-parameter
                         :parameters request-parameters
                         :destination-parameters (:parameters action)}))))
    (case action-type
      :query
      (execute-query-action! action request-parameters)

      :http
      (http-action/execute-http-action! action request-parameters)

      (throw (ex-info (tru "Unknown action type {0}." (name action-type)) action)))))

(defn- implicit-action-table
  [card_id]
  (let [card (db/select-one Card :id card_id)
        {:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
    (hydrate (db/select-one Table :id table-id) :fields)))

(defn- execute-implicit-action
  [{:keys [card_id slug requires_pk] :as _model-action} request-parameters]
  (let [{database-id :db_id table-id :id :as table} (implicit-action-table card_id)
        pk-fields (filterv #(isa? (:semantic_type %) :type/PK) (:fields table))
        slug->field-name (into {} (map (juxt (comp u/slugify :name) :name)) (:fields table))
        _ (api/check (action/unique-field-slugs? (:fields table))
                     400
                     (tru "Cannot execute implicit action on a table with ambiguous column names."))
        _ (api/check (= (count pk-fields) 1)
                     400
                     (tru "Must execute implicit action on a table with a single primary key."))
        extra-parameters (set/difference (set (keys request-parameters))
                                         (set (keys slug->field-name)))

        pk-field (first pk-fields)
        simple-parameters (update-keys request-parameters (comp keyword slug->field-name))
        pk-field-name (keyword (:name pk-field))
        _ (api/check (empty? extra-parameters)
                     400
                     {:message (tru "No destination parameter found for {0}. Found: {1}"
                                    (pr-str extra-parameters)
                                    (pr-str (set (keys slug->field-name))))
                      :parameters request-parameters
                      :destination-parameters (keys slug->field-name)})

        _ (api/check (or (not requires_pk)
                         (some? (get simple-parameters pk-field-name)))
                     400
                     (tru "Missing primary key parameter: {0}"
                          (pr-str (u/slugify (:name pk-field)))))
        query (cond-> {:database database-id,
                       :type :query,
                       :query {:source-table table-id}}
                requires_pk
                (assoc-in [:query :filter]
                          [:= [:field (:id pk-field) nil] (get simple-parameters pk-field-name)]))
        implicit-action (cond
                          (= slug "delete")
                          :row/delete

                          requires_pk
                          :row/update

                          :else
                          :row/create)
        row-parameters (cond-> simple-parameters
                         (not= implicit-action :row/create) (dissoc pk-field-name))
        _ (api/check (or (= implicit-action :row/delete) (seq row-parameters))
                     400
                     (tru "Implicit parameters must be provided."))
        arg-map (cond-> query
                  (= implicit-action :row/create)
                  (assoc :create-row row-parameters)

                  (= implicit-action :row/update)
                  (assoc :update-row row-parameters))]
    (actions/perform-action! implicit-action arg-map)))

(defn execute-dashcard!
  "Execute the given action in the dashboard/dashcard context with the given parameters
   of shape `{<parameter-id> <value>}."
  [dashboard-id dashcard-id slug request-parameters]
  (actions/check-actions-enabled)
  (api/read-check Dashboard dashboard-id)
  (let [dashcard (api/check-404 (db/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        model-action (api/check-404 (db/select-one ModelAction :card_id (:card_id dashcard) :slug slug))]
    (if-let [action-id (:action_id model-action)]
      (execute-custom-action action-id request-parameters)
      (execute-implicit-action model-action request-parameters))))
