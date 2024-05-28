(ns metabase.actions.execution
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.actions :as actions]
   [metabase.actions.http-action :as http-action]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models :refer [Card DashboardCard Database Table]]
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
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- execute-query-action!
  "Execute a `QueryAction` with parameters as passed in from an
  endpoint of shape `{<parameter-id> <value>}`.

  `action` should already be hydrated with its `:card`."
  [{:keys [dataset_query model_id] :as action} request-parameters]
  (log/tracef "Executing action\n\n%s" (u/pprint-to-str action))
  (try
    (let [parameters (for [parameter (:parameters action)]
                       (assoc parameter :value (get request-parameters (:id parameter))))
          query (-> dataset_query
                    (update :type keyword)
                    (assoc :parameters parameters))]
      (log/debugf "Query (before preprocessing):\n\n%s" (u/pprint-to-str query))
      (binding [qp.perms/*card-id* model_id]
        (qp.writeback/execute-write-query! query)))
    (catch Throwable e
      (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
        (api/throw-403 e)
        (throw (ex-info (format "Error executing Action: %s" (ex-message e))
                        {:action     action
                         :parameters request-parameters}
                        e))))))

(defn- implicit-action-table
  [card_id]
  (let [card (t2/select-one Card :id card_id)
        {:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
    (t2/hydrate (t2/select-one Table :id table-id) :fields)))

(defn- execute-custom-action [action request-parameters]
  (let [{action-type :type} action]
    (actions/check-actions-enabled! action)
    (let [model (t2/select-one Card :id (:model_id action))]
      (when (and (= action-type :query) (not= (:database_id model) (:database_id action)))
        ;; the above check checks the db of the model. We check the db of the query action here
        (actions/check-actions-enabled-for-database!
         (t2/select-one Database :id (:database_id action)))))
    (try
     (case action-type
       :query
       (execute-query-action! action request-parameters)

       :http
       (http-action/execute-http-action! action request-parameters))
     (catch Exception e
       (log/error e "Error executing action.")
       (if-let [ed (ex-data e)]
         (let [ed (cond-> ed
                    (and (nil? (:status-code ed))
                         (= (:type ed) :missing-required-permissions))
                    (assoc :status-code 403)

                    (nil? (:message ed))
                    (assoc :message (ex-message e)))]
           (if (= (ex-data e) ed)
             (throw e)
             (throw (ex-info (ex-message e) ed e))))
         {:body {:message (or (ex-message e) (tru "Error executing action."))}
          :status 500})))))

(defn- check-no-extra-parameters
  "Check that the given request parameters do not contain any parameters that are not in the given set of destination parameter ids"
  [request-parameters destination-param-ids]
  (let [extra-parameters (set/difference (set (keys request-parameters))
                                         (set destination-param-ids))]
    (api/check (empty? extra-parameters)
               400
               {:status-code            400
                :message                (tru "No destination parameter found for {0}. Found: {1}"
                                             (pr-str extra-parameters)
                                             (pr-str destination-param-ids))
                :type                   qp.error-type/invalid-parameter
                :parameters             request-parameters
                :destination-parameters destination-param-ids})))

(mu/defn ^:private build-implicit-query :- [:map
                                            [:query          ::mbql.s/Query]
                                            [:row-parameters ::lib.schema.actions/row]
                                            ;; TODO -- the schema for these should probably be
                                            ;; `:metabase.lib.schema.parameter/parameter` instead of `:any`, but I'm not
                                            ;; 100% sure about that.
                                            [:prefetch-parameters {:optional true} [:tuple :any]]]
  [{:keys [model_id parameters] :as _action} implicit-action request-parameters]
  (let [{database-id :db_id
         table-id :id :as table} (implicit-action-table model_id)
        table-fields             (:fields table)
        pk-fields                (filterv #(isa? (:semantic_type %) :type/PK) table-fields)
        slug->field-name         (->> table-fields
                                      (map (juxt (comp u/slugify :name) :name))
                                      (into {})
                                      (m/filter-keys (set (map :id parameters))))
        _                        (api/check (action/unique-field-slugs? table-fields)
                                            400
                                            (tru "Cannot execute implicit action on a table with ambiguous column names."))
        _                        (api/check (= (count pk-fields) 1)
                                            400
                                            (tru "Must execute implicit action on a table with a single primary key."))
        _                        (check-no-extra-parameters request-parameters (keys slug->field-name))
        pk-field                 (first pk-fields)
        ;; Ignore params with nil values; the client doesn't reliably omit blank, optional parameters from the
        ;; request. See discussion at #29049
        simple-parameters        (->> (update-keys request-parameters slug->field-name)
                                      (filter (fn [[_k v]] (some? v)))
                                      (into {}))
        pk-field-name            (:name pk-field)
        row-parameters           (cond-> simple-parameters
                                   (not= implicit-action :row/create) (dissoc pk-field-name))
        requires-pk?             (contains? #{:row/delete :row/update} implicit-action)]
    (api/check (or (not requires-pk?)
                   (some? (get simple-parameters pk-field-name)))
               400
               (tru "Missing primary key parameter: {0}"
                    (pr-str (u/slugify (:name pk-field)))))
    (cond-> {:query {:database database-id,
                     :type :query,
                     :query {:source-table table-id}}
             :row-parameters row-parameters}

      requires-pk?
      (assoc-in [:query :query :filter]
                [:= [:field (:id pk-field) nil] (get simple-parameters pk-field-name)])

      requires-pk?
      (assoc :prefetch-parameters [{:target [:dimension [:field (:id pk-field) nil]]
                                    :type "id"
                                    :value [(get simple-parameters pk-field-name)]}]))))

(defn- execute-implicit-action
  [action request-parameters]
  (let [implicit-action (keyword (:kind action))
        {:keys [query row-parameters]} (build-implicit-query action implicit-action request-parameters)
        _ (api/check (or (= implicit-action :row/delete) (seq row-parameters))
                     400
                     (tru "Implicit parameters must be provided."))
        arg-map (cond-> query
                  (= implicit-action :row/create)
                  (assoc :create-row row-parameters)

                  (= implicit-action :row/update)
                  (assoc :update-row row-parameters))]
    (binding [qp.perms/*card-id* (:model_id action)]
      (actions/perform-action! implicit-action arg-map))))

(mu/defn execute-action!
  "Execute the given action with the given parameters of shape `{<parameter-id> <value>}."
  [action request-parameters]
  (let [;; if a value is supplied for a hidden parameter, it should raise an error
        field-settings         (get-in action [:visualization_settings :fields])
        hidden-param-ids       (->> (vals field-settings)
                                    (filter :hidden)
                                    (map :id))
        destination-param-ids  (set/difference (set (map :id (:parameters action))) (set hidden-param-ids))
        _ (check-no-extra-parameters request-parameters destination-param-ids)
        ;; add default values for missing parameters (including hidden ones)
        all-param-ids          (set (map :id (:parameters action)))
        provided-param-ids     (set (keys request-parameters))
        missing-param-ids      (set/difference all-param-ids provided-param-ids)
        missing-param-defaults (into {}
                                     (keep (fn [param-id]
                                             (when-let [default-value (get-in field-settings [param-id :defaultValue])]
                                               [param-id default-value])))
                                     missing-param-ids)
        request-parameters     (merge missing-param-defaults request-parameters)]
    (case (:type action)
      :implicit
      (execute-implicit-action action request-parameters)
      (:query :http)
      (execute-custom-action action request-parameters)
      (throw (ex-info (tru "Unknown action type {0}." (name (:type action))) action)))))

(mu/defn execute-dashcard!
  "Execute the given action in the dashboard/dashcard context with the given parameters
   of shape `{<parameter-id> <value>}."
  [dashboard-id       :- ::lib.schema.id/dashboard
   dashcard-id        :- ::lib.schema.id/dashcard
   request-parameters :- [:maybe [:map-of :string :any]]]
  (let [dashcard (api/check-404 (t2/select-one DashboardCard
                                               :id dashcard-id
                                               :dashboard_id dashboard-id))
        action (api/check-404 (action/select-action :id (:action_id dashcard)))]
    (snowplow/track-event! ::snowplow/action-executed api/*current-user-id* {:source    :dashboard
                                                                             :type      (:type action)
                                                                             :action_id (:id action)})
    (execute-action! action request-parameters)))

(defn- fetch-implicit-action-values
  [action request-parameters]
  (api/check (contains? #{"row/update" "row/delete"} (:kind action))
             400
             (tru "Values can only be fetched for actions that require a Primary Key."))
  (let [implicit-action (keyword (:kind action))
        {:keys [prefetch-parameters]} (build-implicit-query action implicit-action request-parameters)
        info {:executed-by api/*current-user-id*
              :context     :action
              :action-id   (:id action)}
        card (t2/select-one Card :id (:model_id action))
        ;; prefilling a form with day old data would be bad
        result (binding [persisted-info/*allow-persisted-substitution* false]
                 (qp/process-query
                  (qp/userland-query
                   (qp.card/query-for-card card prefetch-parameters nil nil)
                   info)))
        ;; only expose values for fields that are not hidden
        hidden-param-ids (keep #(when (:hidden %) (:id %))
                               (vals (get-in action [:visualization_settings :fields])))
        exposed-param-ids (-> (set (map :id (:parameters action)))
                              (set/difference (set hidden-param-ids)))]
    (m/filter-keys
      #(contains? exposed-param-ids %)
      (zipmap
        (map (comp u/slugify :name) (get-in result [:data :cols]))
        (first (get-in result [:data :rows]))))))

(defn fetch-values
  "Fetch values to pre-fill implicit action execution - custom actions will return no values.
  Must pass in parameters of shape `{<parameter-id> <value>}` for primary keys."
  [action request-parameters]
  (if (= :implicit (:type action))
    (fetch-implicit-action-values action request-parameters)
    {}))
