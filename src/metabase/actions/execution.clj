(ns metabase.actions.execution
  (:require
    [clojure.set :as set]
    [clojure.tools.logging :as log]
    [medley.core :as m]
    [metabase.actions :as actions]
    [metabase.actions.http-action :as http-action]
    [metabase.api.common :as api]
    [metabase.models :refer [Card Dashboard DashboardCard Table]]
    [metabase.models.action :as action]
    [metabase.models.persisted-info :as persisted-info]
    [metabase.models.query :as query]
    [metabase.query-processor :as qp]
    [metabase.query-processor.card :as qp.card]
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

(defn- handle-action-execution-error [ex]
  (log/error ex (tru "Error executing action."))
  (if-let [ed (ex-data ex)]
    (if (:message ed)
      (throw ex)
      (throw (ex-info (ex-message ex) (assoc ed :message (ex-message ex)))))
    {:body {:message (or (ex-message ex) (tru "Error executing action."))}
     :status 500}))

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
    (when-not (contains? #{:query :http} action-type)
      (throw (ex-info (tru "Unknown action type {0}." (name action-type)) action)))
    (try
      (case action-type
        :query
        (execute-query-action! action request-parameters)

        :http
        (http-action/execute-http-action! action request-parameters))
      (catch Exception e
        (handle-action-execution-error e)))))

(defn- implicit-action-table
  [card_id]
  (let [card (db/select-one Card :id card_id)
        {:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
    (hydrate (db/select-one Table :id table-id) :fields)))

(defn- build-implicit-query
  [{:keys [model_id requires_pk parameters] :as _model-action} implicit-action request-parameters]
  (let [{database-id :db_id table-id :id :as table} (implicit-action-table model_id)
        table-fields (:fields table)
        pk-fields (filterv #(isa? (:semantic_type %) :type/PK) table-fields)
        slug->field-name (->> table-fields
                              (map (juxt (comp u/slugify :name) :name))
                              (into {})
                              (m/filter-keys (set (map :id parameters))))
        _ (api/check (action/unique-field-slugs? table-fields)
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
        row-parameters (cond-> simple-parameters
                         (not= implicit-action :row/create) (dissoc pk-field-name))]
    (api/check (or (not requires_pk)
                   (some? (get simple-parameters pk-field-name)))
               400
               (tru "Missing primary key parameter: {0}"
                    (pr-str (u/slugify (:name pk-field)))))
    (api/check (empty? extra-parameters)
               400
               {:message (tru "No destination parameter found for {0}. Found: {1}"
                              (pr-str extra-parameters)
                              (pr-str (set (keys slug->field-name))))
                :parameters request-parameters
                :destination-parameters (keys slug->field-name)})
    (cond->
      {:query {:database database-id,
               :type :query,
               :query {:source-table table-id}}
       :row-parameters row-parameters}

      requires_pk
      (assoc-in [:query :query :filter]
                [:= [:field (:id pk-field) nil] (get simple-parameters pk-field-name)])

      requires_pk
      (assoc :prefetch-parameters [{:target [:dimension [:field (:id pk-field) nil]]
                                    :type "id"
                                    :value [(get simple-parameters pk-field-name)]}]))))

(defn- model-action->implicit-action [model-action]
  (cond
    (= (:slug model-action) "delete")
    :row/delete

    (:requires_pk model-action)
    :row/update

    :else
    :row/create))

(defn- execute-implicit-action
  [model-action request-parameters]
  (let [implicit-action (model-action->implicit-action model-action)
        {:keys [query row-parameters]} (build-implicit-query model-action implicit-action request-parameters)
        _ (api/check (or (= implicit-action :row/delete) (seq row-parameters))
                     400
                     (tru "Implicit parameters must be provided."))
        arg-map (cond-> query
                  (= implicit-action :row/create)
                  (assoc :create-row row-parameters)

                  (= implicit-action :row/update)
                  (assoc :update-row row-parameters))]
    (try
      (actions/perform-action! implicit-action arg-map)
      (catch Exception e
        (handle-action-execution-error e)))))

(defn execute-dashcard!
  "Execute the given action in the dashboard/dashcard context with the given parameters
   of shape `{<parameter-id> <value>}."
  [dashboard-id dashcard-id slug request-parameters]
  (actions/check-actions-enabled)
  (api/read-check Dashboard dashboard-id)
  (let [dashcard (api/check-404 (db/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        model-action (api/check-404 (first (action/merged-model-action nil :card_id (:card_id dashcard) :slug slug)))]
    (if-let [action-id (:action_id model-action)]
      (execute-custom-action action-id request-parameters)
      (execute-implicit-action model-action request-parameters))))

(defn- fetch-implicit-action-values
  [dashboard-id model-action request-parameters]
  (api/check (:requires_pk model-action) 400 (tru "Values can only be fetched for actions that require a Primary Key."))
  (let [implicit-action (model-action->implicit-action model-action)
        {:keys [prefetch-parameters]} (build-implicit-query model-action implicit-action request-parameters)
        info {:executed-by api/*current-user-id*
              :context :question
              :dashboard-id dashboard-id}
        card (db/select-one Card :id (:model_id model-action))
        ;; prefilling a form with day old data would be bad
        result (binding [persisted-info/*allow-persisted-substitution* false]
                 (qp/process-query-and-save-execution!
                   (qp.card/query-for-card card prefetch-parameters nil nil)
                   info))
        exposed-params (set (map :id (:parameters model-action)))]
    (m/filter-keys
      #(contains? exposed-params %)
      (zipmap
        (map (comp u/slugify :name) (get-in result [:data :cols]))
        (first (get-in result [:data :rows]))))))

(defn fetch-values
  "Fetch values to pre-fill implicit action execution - custom actions will return no values.
   Must pass in parameters of shape `{<parameter-id> <value>}` for primary keys."
  [dashboard-id dashcard-id slug request-parameters]
  (actions/check-actions-enabled)
  (api/read-check Dashboard dashboard-id)
  (let [dashcard (api/check-404 (db/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        model-action (api/check-404 (first (action/merged-model-action nil :card_id (:card_id dashcard) :slug slug)))]
    (if (:action_id model-action)
      {}
      (fetch-implicit-action-values dashboard-id model-action request-parameters))))
