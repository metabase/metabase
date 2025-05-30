(ns metabase-enterprise.data-editing.api
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase.actions.core :as actions]
   [metabase.actions.types :as types]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn require-authz?
  "Temporary hack to have auth be off by default, only on if MB_DATA_EDITING_AUTHZ=true.
  Remove once auth policy is fixed for dashboards."
  []
  (= "true" (System/getenv "MB_DATA_EDITING_AUTHZ")))

(defn- check-permissions []
  (when (require-authz?)
    (api/check-superuser)))

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows scope]} :- [:map
                            [:rows [:sequential {:min 1} :map]]
                            ;; TODO make this non-optional in the future
                            [:scope {:optional true} ::types/scope.raw]]]
  (check-permissions)
  (let [;; This is a bit unfortunate... we ignore the table-id in the path when called with a custom scope...
        ;; The solution is to stop accepting custom scope once we migrate the data grid to action/execute
        scope (or scope {:table-id table-id})]
    {:created-rows (map :row (:outputs (actions/perform-action! :data-grid.row/create scope rows)))}))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows pks updates scope]}
   :- [:multi {:dispatch #(cond
                            (:rows %) :mixed-updates
                            (:pks %)  :uniform-updates)}
       [:mixed-updates [:map
                        [:rows [:sequential {:min 1} :map]]
                        ;; TODO make :scope required
                        [:scope {:optional true} ::types/scope.raw]]]
       [:uniform-updates [:map
                          [:pks [:sequential {:min 1} :map]]
                          [:updates :map]
                          ;; TODO make :scope required
                          [:scope {:optional true} ::types/scope.raw]]]]]
  (check-permissions)
  (if (empty? (or rows pks))
    {:updated []}
    (let [;; This is a bit unfortunate... we ignore the table-id in the path when called with a custom scope...
          ;; The solution is to stop accepting custom scope once we migrate the data grid to action/execute
          scope   (or scope {:table-id table-id})
          rows    (or rows
                      ;; For now, it's just a shim, because we haven't implemented an efficient bulk update action yet.
                      ;; This is a dumb shim; we're not checking that the pk maps are really (just) the pks.
                      (map #(merge % updates) pks))]
      {:updated (map :row (:outputs (actions/perform-action! :data-grid.row/update scope rows)))})))

;; This is a POST instead of DELETE as not all web proxies pass on the body of DELETE requests.
(api.macros/defendpoint :post "/table/:table-id/delete"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows scope]} :- [:map
                            [:rows [:sequential {:min 1} :map]]
                            ;; make this non-optional in the future
                            [:scope {:optional true} ::types/scope.raw]]]
  (check-permissions)
  ;; This is a bit unfortunate... we ignore the table-id in the path when called with a custom scope...
  ;; The solution is to stop accepting custom scope once we migrate the data grid to action/execute
  (let [scope (or scope {:table-id table-id})]
    (actions/perform-action! :data-grid.row/delete scope rows)
    {:success true}))

;; might later be changed, or made driver specific, we might later drop the requirement depending on admin trust
;; model (e.g are admins trusted with writing arbitrary SQL cases anyway, will non admins ever call this?)
(def ^:private Identifier
  "A malli schema for strings that can be used as SQL identifiers"
  [:re #"^[\w\- ]+$"])

;; upload types are used temporarily, I expect this to change
(def ^:private column-type->upload-type
  {"auto_incrementing_int_pk" :metabase.upload/auto-incrementing-int-pk
   "boolean"                  :metabase.upload/boolean
   "int"                      :metabase.upload/int
   "float"                    :metabase.upload/float
   "varchar255"               :metabase.upload/varchar-255
   "text"                     :metabase.upload/text
   "date"                     :metabase.upload/date
   "datetime"                 :metabase.upload/datetime
   "offset_datetime"          :metabase.upload/timestamp-with-time-zone})

(def ^:private ColumnType
  (into [:enum] (keys column-type->upload-type)))

(defn- ensure-database-type [driver column-type]
  (if-some [upload-type (column-type->upload-type column-type)]
    (driver/upload-type->database-type driver upload-type)
    (throw (ex-info (i18n/tru "Not a supported column type: {0}" column-type)
                    {:status 400, :column-type column-type}))))

(api.macros/defendpoint :post "/database/:db-id/table"
  "Creates a new table in the given database"
  [{:keys [db-id]} :- [:map [:db-id ms/PositiveInt]]
   _
   {table-name :name
    :keys      [primary_key columns]}
   :-
   [:map
    [:name Identifier]
    [:primary_key [:seqable {:min-count 1} Identifier]]
    [:columns [:seqable
               [:map
                [:name Identifier]
                [:type ColumnType]]]]]]
  (check-permissions)
  (let [{driver :engine :as database} (api/check-404 (t2/select-one :model/Database db-id))
        _          (actions/check-data-editing-enabled-for-database! database)
        column-map (->> (for [{column-name :name
                               column-type :type} columns]
                          [column-name (ensure-database-type driver column-type)])
                        (into {}))]
    (driver/create-table! driver db-id table-name column-map :primary-key (map keyword primary_key))))

(api.macros/defendpoint :post "/webhook"
  "Creates a new webhook endpoint token.
  The token can be used with the unauthenticated ingestion endpoint.
  POST /ee/data-editing-public/webhook/{token} to insert rows."
  [_
   _
   {:keys [table-id]}] :- [:map [:table-id ms/PositiveInt]]
  (check-permissions)
  (let [_       (api/check-404 (t2/select-one :model/Table table-id))
        token   (u/generate-nano-id)
        user-id api/*current-user-id*]
    (t2/insert! :table_webhook_token {:token token, :table_id table-id, :creator_id user-id})
    {:table_id table-id
     :token token}))

(api.macros/defendpoint :delete "/webhook/:token"
  "Deletes a webhook endpoint token."
  [{:keys [token]}
   _
   _]
  (check-permissions)
  (let [deleted-count (t2/delete! :table_webhook_token :token token)]
    (api/check-404 (pos? deleted-count)))
  {})

(api.macros/defendpoint :get "/webhook"
  "Lists webhook endpoints tokens for a table.
  Behaviour is currently undefined if no table-id parameter is specified"
  [_
   {:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]]
  (check-permissions)
  (api/check-404 (t2/select-one :model/Table table-id))
  (let [include-cols [:token :table_id :creator_id]]
    {:tokens (t2/select (into [:table_webhook_token] include-cols) :table_id table-id)}))

(api.macros/defendpoint :get "/row-action/:action-id"
  "Like /api/action but specialises the parameter requirements for a dashcard context where selected rows
  maybe provided values for e.g primary key values.
  Parameter names that intersect with the tables fields will be omitted from the parameter list.
  Later when evaluated as a row action using /row-action/:action-id/execute, you will also be able to omit these parameters."
  [{:keys [action-id]}   :- [:map [:action-id   :string]]
   {:keys [dashcard-id]} :- [:map [:dashcard-id ms/PositiveInt]]]
  (let [action      (-> (actions/select-action :id (parse-long action-id) :archived false)
                        (t2/hydrate :creator)
                        api/read-check)
        ;; TODO flatten this into a single query
        card-id     (api/check-404 (t2/select-one-fn :card_id [:model/DashboardCard :card_id] dashcard-id))
        table-id    (api/check-404 (t2/select-one-fn :table_id [:model/Card :table_id] card-id))
        fields      (t2/select [:model/Field :name] :table_id table-id)
        field-names (set (map :name fields))
        include?    #(not (contains? field-names (:slug %)))]
    (update action :parameters #(some->> % (filterv include?)))))

(defn- input->parameters
  "We support either named or id based parameters for invoking legacy actions. This converts keys to ids, if necessary."
  [parameters input]
  (let [slug-or-id->id (merge (u/index-by :slug :id parameters)
                              (u/index-by :id :id parameters))]
    (if (not-every? #(contains? slug-or-id->id (name %)) (keys input))
      (throw (ex-info
              "Unexpected parameter(s) provided"
              {:status-code 400
               :input       input
               :parameters  parameters}))
      (update-keys input (comp slug-or-id->id name)))))

(defn- execute-saved-action!
  "Implementation handling a sub-sub-case."
  [action input]
  (actions/execute-action! action (input->parameters (:parameters action) input)))

(defn- execute-dashcard-row-action-on-saved-action!
  "Implementation handling a sub-sub-case."
  [action-id dashcard-id pks inputs & [_mapping]]
  (let [action      (-> (actions/select-action :id action-id :archived false)
                        (t2/hydrate :creator)
                        api/read-check)
        ;; TODO flatten this into a single query
        card-id     (api/check-404 (t2/select-one-fn :card_id [:model/DashboardCard :card_id] dashcard-id))
        table-id    (api/check-404 (t2/select-one-fn :table_id [:model/Card :table_id] card-id))
        fields      (t2/select [:model/Field :id :name :semantic_type] :table_id table-id)
        field-names (set (map :name fields))
        pk-fields   (filter #(= :type/PK (:semantic_type %)) fields)
        _           (assert (= 1 (count pks)) "Further work needed to handle matching up database to input rows")
        params      (first inputs)
        [row]       (data-editing/query-db-rows table-id pk-fields pks)
        _           (api/check-404 row)
        row-params  (->> (:parameters action)
                         (keep (fn [{:keys [id slug]}]
                                 ;; TODO handle custom mapping
                                 (when (contains? field-names (or slug id))
                                   [id (row (keyword (or slug id)))])))
                         (into {}))
        provided    (input->parameters (:parameters action) params)]
    [(actions/execute-action! action (merge row-params provided))]))

(defn- execute-dashcard-row-action-on-primitive-action!
  "Implementation handling a sub-sub-case."
  [action-kw scope dashcard-id pks inputs _mapping]
  ;; TODO flatten this into a single query
  (let [card-id   (api/check-404 (t2/select-one-fn :card_id [:model/DashboardCard :card_id] dashcard-id))
        table-id  (api/check-404 (t2/select-one-fn :table_id [:model/Card :table_id] card-id))
        pk-fields (t2/select [:model/Field :id :name :semantic_type] :table_id table-id :semantic_type :type/PK)
        _         (assert (= 1 (count pks)) "Further work needed to handle matching up database to input rows")
        [row]     (data-editing/query-db-rows table-id pk-fields pks)
        _         (api/check-404 row)
        ;; TODO handle custom mapping
        inputs    (for [input inputs]
                    (if (:row input)
                      (assoc input :row (merge row (:row input)))
                      (merge row input)))]
    (:outputs (actions/perform-action! action-kw scope inputs))))

(api.macros/defendpoint :post "/row-action/:action-id/execute"
  "Executes an action as a row action. The allows action parameters sharing a name with column names to be derived from a specific row.
  The caller is still able to supply parameters, which will be preferred to those derived from the row.
  Discovers the table via the provided dashcard-id, assumes a model/editable for now."
  [{:keys [action-id]}   :- [:map [:action-id :string]]
   {:keys [dashcard-id]} :- [:map [:dashcard-id ms/PositiveInt]]
   {:keys [pk params]}   :- [:map
                             [:pk :any]
                             [:params :any]]]
  (first (execute-dashcard-row-action-on-saved-action! (parse-long action-id) dashcard-id [pk] [params])))

(api.macros/defendpoint :get "/tmp-action"
  "Returns all actions across all tables and models"
  [_
   _
   _]
  (api/check-superuser)
  (let [databases          (t2/select [:model/Database :id :settings])
        editable-database? (comp boolean :database-enable-table-editing :settings)
        editable-databases (filter editable-database? databases)

        editable-tables
        (when (seq editable-databases)
          (t2/select :model/Table
                     :db_id [:in (map :id editable-databases)]
                     :active true))

        fields
        (when (seq editable-tables)
          (t2/select :model/Field :table_id [:in (map :id editable-tables)]))

        fields-by-table
        (group-by :table_id fields)

        table-actions
        (for [t editable-tables
              op [:table.row/create :table.row/update :table.row/delete]
              :let [fields (fields-by-table (:id t))
                    action (actions/table-primitive-action t fields op)]]
          (assoc action :table_name (:name t)))

        saved-actions
        (for [a (actions/select-actions nil :archived false)]
          (select-keys a [:name
                          :model_id
                          :type
                          :database_id
                          :id
                          :visualization_settings
                          :parameters]))]
    {:actions (vec (concat saved-actions table-actions))}))

(mr/def ::unified-action.base
  [:or
   [:map {:closed true}
    [:action-id ms/PositiveInt]]
   [:map {:closed true}
    [:action-kw :keyword]
    [:table-id {:optional true} ms/PositiveInt]]])

(mr/def ::unified-action
  [:or
   ::unified-action.base
   [:map {:closed true}
    [:dashboard-action ms/PositiveInt]]
   [:map {:closed true}
    [:row-action ::unified-action.base]
    ;; TODO type our mappings
    [:mapping :map]
    ;; TODO generalize so we can support grids outside of dashboards
    [:dashcard-id ms/PositiveInt]]])

(mu/defn- fetch-unified-action :- ::unified-action
  "Resolve various types of action id into a semantic map which is easier to dispatch on."
  [scope :- ::types/scope.hydrated
   raw-id :- [:or :string ms/NegativeInt ms/PositiveInt]]
  (cond
    (pos-int? raw-id) {:action-id raw-id}
    (neg-int? raw-id) (let [[op param] (actions/unpack-encoded-action-id raw-id)]
                        (cond
                          (isa? op :table.row/common)
                          {:action-kw op, :table-id param}
                          :else
                          (throw (ex-info "Execution not supported for given encoded action" {:status    400
                                                                                              :action-id raw-id
                                                                                              :op        op
                                                                                              :param     param}))))
    (string? raw-id) (if-let [[_ dashcard-id _nested-id] (re-matches #"^dashcard:([^:]+):(.*)$" raw-id)]
                       (let [dashcard-id (if (= "unknown" dashcard-id) (:dashcard-id scope) (parse-long dashcard-id))
                             dashcard    (api/check-404 (some->> dashcard-id (t2/select-one [:model/DashboardCard :visualization_settings])))
                             actions     (-> dashcard :visualization_settings :editableTable.enabledActions)
                             ;; TODO actual_id should get renamed to id at some point in the FE
                             viz-action  (api/check-404 (first (filter (comp #{raw-id} #(or (:actual_id %) (:id %))) actions)))
                             ;; TODO id should get renamed to action_id at some point as well
                             inner-id    (or (:action_id viz-action) (:id viz-action))
                             unified     (fetch-unified-action scope inner-id)
                             action-type (:type viz-action "row-action")
                             mapping     (:parameterMappings viz-action {})]
                         (assert (:enabled viz-action) "Cannot call disabled actions")
                         (case action-type
                           "row-action" {:row-action unified, :mapping mapping, :dashcard-id dashcard-id}))
                       (if-let [[_ dashcard-id] (re-matches #"^dashcard:(\d+)$" raw-id)]
                         ;; Dashboard buttons can only be invoked from dashboards
                         ;; We're not checking that the scope has the correct dashboard, but if it's incorrect, there
                         ;; will be a 404 thrown when we try to execute the action.
                         ;; This 404 here is not the best error to return, but we can polish this later.
                         (let [dashboard-id (api/check-404 (:dashboard-id scope))]
                           (api/read-check :model/Dashboard dashboard-id)
                           {:dashboard-action (parse-long dashcard-id)})
                         ;; Not a fancy encoded string, it must refer directly to a primitive.
                         {:action-kw (keyword raw-id)}))
    :else
    (throw (ex-info "Unexpected id value" {:status 400, :action-id raw-id}))))

(defn- execute!* [action-id scope inputs]
  (let [scope   (actions/hydrate-scope scope)
        unified (fetch-unified-action scope action-id)]
    (cond
      (:action-id unified)
      (let [action (api/read-check (actions/select-action :id (:action-id unified) :archived false))]
        (api/check-400 (= 1 (count inputs)) "Saved actions currently only support a single input")
        [(execute-saved-action! action (first inputs))])
      (:action-kw unified)
      (let [action-kw (keyword (:action-kw unified))]
        (:outputs
         ;; Weird magic currying we've been doing implicitly.
         (if (and (isa? action-kw :table.row/common) (:table-id unified))
           (actions/perform-action! action-kw scope (for [i inputs] {:table-id (:table-id unified), :row i}))
           (actions/perform-action! action-kw scope inputs))))
      (:dashboard-action unified)
      (do
        (api/check-400 (= 1 (count inputs)) "Saved actions currently only support a single input")
        [(actions/execute-dashcard! (:dashboard-id scope)
                                    (:dashboard-action unified)
                                    (walk/stringify-keys (first inputs)))])
      (:row-action unified)
      ;; use flat namespace for now, probably want to separate form inputs from pks
      (let [row-action  (:row-action unified)
            mapping     (:mapping unified)
            ;; will need to generalize this once we can use actions on fullscreen tables / editables / questions.
            dashcard-id (:dashcard-id unified)
            saved-id    (:action-id row-action)
            action-kw   (:action-kw row-action)
            ;; TODO probably take the row separately from inputs
            pks         inputs
            inputs      (for [input inputs]
                          (if (seq mapping)
                            (walk/postwalk-replace {"::root" input} mapping)
                            input))]
        (cond
          saved-id
          (execute-dashcard-row-action-on-saved-action! saved-id dashcard-id pks inputs mapping)
          action-kw
          (let [table-id (:table-id row-action)]
            ;; Weird magic currying we've been doing implicitly.
            (if (and table-id (isa? action-kw :table.row/common))
              (let [inputs (for [input inputs] {:table-id table-id, :row input})]
                (execute-dashcard-row-action-on-primitive-action! action-kw scope dashcard-id pks inputs mapping))
              (execute-dashcard-row-action-on-primitive-action! action-kw scope dashcard-id pks inputs mapping)))))
      :else
      (throw (ex-info "Not able to execute given action yet" {:status-code 500, :scope scope, :unified unified})))))

(api.macros/defendpoint :post "/action/v2/execute"
  "The One True API for invoking actions.
  It doesn't care whether the action is saved or primitive, and whether it has been placed.
  In particular, it supports:
  - Custom model actions as well as primitive actions, and encoded hack actions which use negative ids.
  - Stand-alone actions, Dashboard actions, Row actions, and whatever else comes along.
  Since actions are free to return multiple outputs even for a single output, the response is always plural."
  [{}
   {}
   {:keys [action_id scope input]}
   :- [:map
       [:action_id [:or :string ms/NegativeInt ms/PositiveInt]]
       [:scope     ::types/scope.raw]
       [:input     :map]]]
  {:outputs (execute!* action_id scope [input])})

(api.macros/defendpoint :post "/action/v2/execute-bulk"
  "The *other* One True API for invoking actions. The only difference is that it accepts multiple inputs."
  [{}
   {}
   {:keys [action_id scope inputs]}
   :- [:map
       [:action_id [:or :string ms/NegativeInt ms/PositiveInt]]
       [:scope     ::types/scope.raw]
       [:inputs    [:sequential :map]]]]
  {:outputs (execute!* action_id scope inputs)})

(api.macros/defendpoint :post "/tmp-modal"
  "Temporary endpoint for describing an actions parameters
  such that they can be presented correctly in a modal ahead of execution."
  [{}
   {}
   {:keys [action_id scope #_input]}]
  (let [scope   (actions/hydrate-scope scope)
        unified (fetch-unified-action scope action_id)

        ;; todo mapping support
        describe-saved-action
        (fn [& {:keys [action-id _row-action-dashcard-id _mapping]}]
          (let [action (-> (actions/select-action :id action-id
                                                  :archived false
                                                  {:where [:not [:= nil :model_id]]})

                           api/read-check
                           api/check-404)
                param-id->viz-field (-> action :visualization_settings (:fields {}))]
            {:title (:name action)
             :parameters
             (->> (for [param (:parameters action)
                        ;; query type actions store most stuff in viz settings rather than the
                        ;; parameter
                        :let [viz-field (param-id->viz-field (:id param))]
                        :when (not (:hidden viz-field))]
                    (u/remove-nils
                      ;; todo dropdown options
                     {:id (:id param)
                      :display_name (or (:display-name param) (:name param))
                      :type (case (:type param)
                              :string/=    :type/Text
                              :number/=    :type/Number
                              :date/single :type/Date
                              (if (= "type" (namespace (:type param)))
                                (:type param)
                                (throw
                                 (ex-info "Unsupported query action parameter type"
                                          {:status-code 500
                                           :param-type (:type param)
                                           :scope scope
                                           :unified unified}))))
                      :optional (and (not (:required param)) (not (:required viz-field)))}))
                  vec)}))

        ;; todo mapping support
        describe-table-action
        (fn [& {:keys [action-kw table-id _mapping]}]
          (let [table (api/read-check (t2/select-one :model/Table :id table-id :active true))]
            {:title (format "%s: %s" (:display_name table) (u/capitalize-en (name action-kw)))
             :parameters
             (->> (for [field (->> (t2/select :model/Field :table_id table-id)
                                   (sort-by :position))
                        :let [pk (= :type/PK (:semantic_type field))]
                        :when (case action-kw
                                ;; create does not take pk cols if auto increment, todo generated cols?
                                :table.row/create (not (:database_is_auto_increment field))
                                ;; delete only requires pk cols
                                :table.row/delete pk
                                ;; update takes both the pk and field (if not a row action)
                                :table.row/update true)
                        :let [required (or pk (:database_required field))]]
                    (u/remove-nils
                     {:id (:name field)
                      :display_name (:display_name field)
                      :type (:base_type field)
                      :optional (not required)
                      :nullable (:database_is_nullable field)}))

                  vec)}))]

    (cond
      ;; saved action
      (:action-id unified)
      (describe-saved-action :action-id (:action-id unified))

      ;; table action
      (:action-kw unified)
      (let [action-kw (keyword (:action-kw unified))
            table-id  (:table-id unified)]
        (describe-table-action :action-kw action-kw
                               :table-id table-id))

      (:row-action unified)
      (let [row-action  (:row-action unified)
            mapping     (:mapping unified)
            dashcard-id (:dashcard-id unified)
            saved-id    (:action-id row-action)
            action-kw   (:action-kw row-action)]
        (cond
          saved-id
          (describe-saved-action :action-id saved-id
                                 :row-action-dashcard-id dashcard-id
                                 :row-action-mapping mapping)

          action-kw
          (let [table-id (:table-id row-action)]
            (describe-table-action :action-kw action-kw
                                   :table-id table-id
                                   :row-action-mapping mapping))

          :else (ex-info "Not a supported row action" {:status-code 500, :scope scope, :unified unified})))
      :else
      (throw (ex-info "Not able to execute given action yet" {:status-code 500, :scope scope, :unified unified})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
