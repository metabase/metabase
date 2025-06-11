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
  [{:keys [token]} :- [:map [:token [:string {:api/regex #"[0-9a-zA-Z-_]+"}]]]
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

(defn- execute-saved-action! [action inputs]
  (doall
   (for [input inputs]
     (actions/execute-action! action (input->parameters (:parameters action) input)))))

(defn- execute-saved-action-from-id! [action-id inputs]
  (let [action (-> (actions/select-action :id action-id :archived false) (t2/hydrate :creator) api/read-check)]
    (execute-saved-action! action inputs)))

(api.macros/defendpoint :get "/tmp-action"
  "Returns all actions across all tables and models"
  [_
   _
   _]
  (check-permissions)
  (let [databases          (t2/select [:model/Database :id :settings])
        editable-database? (comp boolean :database-enable-table-editing :settings)
        editable-databases (filter editable-database? databases)
        editable-tables    (when (seq editable-databases)
                             (t2/select :model/Table
                                        :db_id [:in (map :id editable-databases)]
                                        :active true))
        fields             (when (seq editable-tables)
                             (t2/select :model/Field :table_id [:in (map :id editable-tables)]))
        fields-by-table    (group-by :table_id fields)
        table-actions      (for [t            editable-tables
                                 [op op-name] actions/enabled-table-actions
                                 :let [fields (fields-by-table (:id t))
                                       action (actions/table-primitive-action t fields op)]]
                             (assoc action :table_name op-name))
        saved-actions      (for [a (actions/select-actions nil :archived false)]
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
    [:mapping {:optional true} [:maybe :map]]]])

(mr/def ::unified-action
  [:or
   ::unified-action.base
   [:map {:closed true}
    [:dashboard-action ms/PositiveInt]]
   [:map {:closed true}
    [:inner-action ::unified-action.base]
    ;; TODO type our mappings
    [:mapping [:maybe :map]]
    [:param-map :map]
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
                          {:action-kw op, :mapping {:table-id param, :row ::root}}
                          :else
                          (throw (ex-info "Execution not supported for given encoded action" {:status    400
                                                                                              :action-id raw-id
                                                                                              :op        op
                                                                                              :param     param}))))
    (string? raw-id) (if-let [[_ dashcard-id _nested-id] (re-matches #"^dashcard:([^:]+):(.*)$" raw-id)]
                       (let [dashcard-id (if (= "unknown" dashcard-id) (:dashcard-id scope) (parse-long dashcard-id))
                             dashcard    (api/check-404 (some->> dashcard-id (t2/select-one [:model/DashboardCard :visualization_settings])))
                             actions     (-> dashcard :visualization_settings :editableTable.enabledActions)
                             viz-action  (api/check-404 (first (filter (comp #{raw-id} :id) actions)))
                             inner-id    (:actionId viz-action)
                             unified     (fetch-unified-action scope inner-id)
                             action-type (:actionType viz-action "data-grid/row-action")
                             mapping     (:mapping viz-action)
                             param-map   (->> (:parameterMappings viz-action {})
                                              (u/index-by :parameterId #(dissoc % :parameterId))
                                              walk/keywordize-keys)]
                         (assert (:enabled viz-action) "Cannot call disabled actions")
                         (case action-type
                           ("data-grid/built-in"
                            "data-grid/row-action")
                           {:inner-action unified
                            :mapping      mapping
                            :param-map    param-map
                            :dashcard-id  dashcard-id}))
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

(defn- hydrate-mapping [mapping]
  (walk/postwalk-replace
   {"::root" ::root
    "::key"  ::key}
   mapping))

(defn- augment-params [{:keys [dashcard-id param-map] :as _action} input params]
  (let [row (delay (let [{:keys [table-id]} (actions/cached-value
                                             [:dashcard-viz dashcard-id]
                                             #(t2/select-one-fn :visualization_settings :model/DashboardCard dashcard-id))]
                     (if-not table-id
                       ;; this is not an Editable, it must be a question - so we use the client-side row
                       (update-keys input name)
                       ;; TODO batch fetching all these rows, across all inputs
                       (let [fields    (t2/select [:model/Field :id :name :semantic_type] :table_id table-id)
                             pk-fields (filter #(= :type/PK (:semantic_type %)) fields)
                             ;; TODO we could restrict which fields we fetch in future
                             [row]     (data-editing/query-db-rows table-id pk-fields [input])
                             _         (api/check-404 row)]
                         ;; staging uses both field ids and names, not sure which is canonical
                         ;; we just support both
                         (merge
                          (update-keys row (comp (u/index-by :name :id fields) name))
                          (update-keys row name))))))]
    (reduce-kv
     (fn [acc k v]
       (case (:sourceType v)
         "ask-user" (if-let [default (:value v)]
                      (if-not (contains? acc k)
                        (assoc acc k default)
                        acc)
                      acc)
         "constant" (assoc acc k (:value v))
         ;; TODO: support override from params?
         "row-data" (assoc acc k (get @row (:sourceValueTarget v)))))
     (merge input params)
     param-map)))

(defn- apply-mapping [{:keys [mapping] :as action} params inputs]
  (let [mapping (hydrate-mapping mapping)]
    (if-not mapping
      (if (or params (:param-map action))
        (map #(augment-params action % params) inputs)
        inputs)
      (for [input inputs
            :let [root (augment-params action input params)]]
        (walk/postwalk
         (fn [x]
           (cond
             ;; TODO handle the fact this stuff can be json-ified better
             (= ::root x)
             root
             ;; specific key
             (and (vector? x) (= ::key (first x)))
             (get root (keyword (second x)))
             :else
             x))
         mapping)))))

(defn- apply-mapping-nested [{:keys [inner-action] :as outer-action} params inputs-before]
  (let [inputs-after (apply-mapping outer-action params inputs-before)]
    (if inner-action
      (recur inner-action nil inputs-after)
      inputs-after)))

(defn- execute!* [action-id scope params raw-inputs]
  (let [scope   (actions/hydrate-scope scope)
        unified (fetch-unified-action scope action-id)
        inputs  (apply-mapping-nested unified params raw-inputs)]
    (cond
      (:action-id unified)
      (let [action (api/read-check (actions/select-action :id (:action-id unified) :archived false))]
        (api/check-400 (= 1 (count inputs)) "Saved actions currently only support a single input")
        (execute-saved-action! action inputs))
      (:action-kw unified)
      (let [action-kw (keyword (:action-kw unified))]
        (:outputs (actions/perform-action! action-kw scope inputs)))
      (:dashboard-action unified)
      (do
        (api/check-400 (= 1 (count inputs)) "Saved actions currently only support a single input")
        [(actions/execute-dashcard! (:dashboard-id scope)
                                    (:dashboard-action unified)
                                    (walk/stringify-keys (first inputs)))])
      (:inner-action unified)
      ;; use flat namespace for now, probably want to separate form inputs from pks
      (let [inner     (:inner-action unified)
            saved-id  (:action-id inner)
            action-kw (:action-kw inner)]
        (cond
          saved-id
          (execute-saved-action-from-id! saved-id inputs)
          action-kw
          (:outputs (actions/perform-action! action-kw scope inputs))))
      :else
      (throw (ex-info "Not able to execute given action yet" {:status-code 500, :scope scope, :unified unified})))))

(def execute-single
  "A temporary var for our proxy in [[metabase.actions.api]] to call, until we move this endpoint there."
  (api.macros/defendpoint :post "/action/v2/execute"
    "The One True API for invoking actions.
    It doesn't care whether the action is saved or primitive, and whether it has been placed.
    In particular, it supports:
    - Custom model actions as well as primitive actions, and encoded hack actions which use negative ids.
    - Stand-alone actions, Dashboard actions, Row actions, and whatever else comes along.
    Since actions are free to return multiple outputs even for a single output, the response is always plural."
    [{}
     {}
     {:keys [action_id scope params input]}
     :- [:map
         ;; TODO docstrings for these
         [:action_id [:or :string ms/NegativeInt ms/PositiveInt]]
         [:scope ::types/scope.raw]
         [:params {:optional true} :map]
         [:input :map]]]
    {:outputs (execute!* action_id scope params [input])}))

(def execute-bulk
  "A temporary var for our proxy in [[metabase.actions.api]] to call, until we move this endpoint there."
  (api.macros/defendpoint :post "/action/v2/execute-bulk"
    "The *other* One True API for invoking actions. The only difference is that it accepts multiple inputs."
    [{}
     {}
     {:keys [action_id scope inputs params]}
     :- [:map
         [:action_id [:or :string ms/NegativeInt ms/PositiveInt]]
         [:scope ::types/scope.raw]
         [:inputs [:sequential :map]]
         [:params {:optional true} :map]]]
    ;; TODO get rid of *params* and use :mapping pattern to handle nested deletes
    {:outputs (binding [actions/*params* params]
                (execute!* action_id scope (dissoc params :delete-children) inputs))}))

(api.macros/defendpoint :post "/tmp-modal"
  "Temporary endpoint for describing an actions parameters
  such that they can be presented correctly in a modal ahead of execution."
  [{}
   {}
   ;; TODO support for bulk actions
   {:keys [action_id scope input]}]
  (let [scope (actions/hydrate-scope scope)
        unified
        ;; this mess can go once callers are on new listing API, leaving only the unified-action call.
        ;; but then this route's lifetime should be similarly limited!
        (cond
          (not (#{"table.row/create"
                  "table.row/update"
                  "table.row/delete"} action_id))
          (fetch-unified-action scope action_id)

          (:table-id input)
          {:action-kw (keyword action_id)
           :mapping   {:table-id (:table-id input)
                       :row      ::root}}

          (:dashcard-id scope)
          (let [{:keys [dashcard-id]} scope
                {:keys [dashboard_id visualization_settings]} (t2/select-one :model/DashboardCard dashcard-id)]
            (api/read-check (t2/select-one :model/Dashboard dashboard_id))
            {:dashcard-viz  visualization_settings
             :inner-action  {:action-kw (keyword action_id)
                             :mapping   {:table-id (:table_id visualization_settings)
                                         :row      ::root}}
             :param-mapping (->> visualization_settings
                                 :editableTable.enabledActions
                                 (some (fn [{:keys [id parameterMappings]}]
                                         (when (= id action_id)
                                           parameterMappings))))})

          (:table-id scope)
          {:action-kw (keyword action_id)
           :mapping   {:table-id (:table-id scope)
                       :row      ::root}}

          :else
          (throw (ex-info "Using table.row/* actions require either a table-id or dashcard-id in the scope"
                          {:status-code 400
                           :scope       scope
                           :action_id   action_id})))

        param-value
        (fn [param-mapping row-delay]
          (case (:sourceType param-mapping)
            "constant" (:value param-mapping)
            "row-data" (when row-delay (get @row-delay (keyword (:sourceValueTarget param-mapping))))
            nil))

        saved-param-base-type
        (fn [saved-param viz-field]
          (let [{param-type :type} saved-param]
            (case param-type
              :string/= :type/Text
              :number/= :type/Number
              :date/single (case (:inputType viz-field)
                             ;; formatting needs thought
                             "datetime" :type/DateTime
                             :type/Date)
              (if (= "type" (namespace param-type))
                type
                (throw
                 (ex-info "Unsupported query action parameter type"
                          {:status-code 500
                           :param-type  param-type
                           :scope       scope
                           :unified     unified}))))))

        saved-param-input-type
        (fn [saved-param viz-field]
          (cond
            ;; we could distinguish between inline-select and dropdown (which are both options for model action params)
            (seq (:valueOptions viz-field))
            "dropdown"

            (= "text" (:inputType viz-field))
            "textarea"

            :else
            (condp #(isa? %2 %1) (saved-param-base-type saved-param viz-field)
              :type/Date     "date"
              :type/DateTime "datetime"
              "text")))

        describe-saved-action
        (fn [& {:keys [action-id
                       param-mapping
                       row-delay]}]
          (let [action              (-> (actions/select-action :id action-id
                                                               :archived false
                                                               {:where [:not [:= nil :model_id]]})
                                        api/read-check
                                        api/check-404)
                param-id->viz-field (-> action :visualization_settings (:fields {}))
                param-id->mapping   (u/index-by :parameterId param-mapping)]

            {:title (:name action)
             :parameters
             (->> (for [param (:parameters action)
                        ;; query type actions store most stuff in viz settings rather than the
                        ;; parameter
                        :let [viz-field     (param-id->viz-field (:id param))
                              param-mapping (param-id->mapping (:id param))]
                        :when (and (not (:hidden viz-field))
                                   (not= "hidden" (:visibility param-mapping)))]
                    (u/remove-nils
                     {:id            (:id param)
                      :display_name  (or (:display-name param) (:name param))
                      :param-mapping param-mapping
                      :input_type    (saved-param-input-type param viz-field)
                      :optional      (and (not (:required param)) (not (:required viz-field)))
                      :nullable      true             ; is there a way to know this?
                      :readonly      (= "readonly" (:visibility param-mapping))
                      :value         (param-value param-mapping row-delay)
                      :value_options (:valueOptions viz-field)}))
                  vec)}))

        field-input-type
        (fn [field field-values]
          (case (:type field-values)
            (:list :auto-list :search) "dropdown"
            (condp #(isa? %2 %1) (:semantic_type field)
              :type/Description "textarea"
              :type/Category    "dropdown"
              :type/FK          "dropdown"
              (condp #(isa? %2 %1) (:base_type field)
                :type/Date     "date"
                :type/DateTime "datetime"
                "text"))))

        describe-table-action
        (fn [& {:keys [action-kw
                       table-id
                       param-mapping
                       dashcard-viz
                       row-delay]}]
          (let [table-id                    table-id
                table                       (api/read-check (t2/select-one :model/Table :id table-id :active true))
                field-name->mapping         (u/index-by :parameterId param-mapping)
                fields                      (-> (t2/select :model/Field :table_id table-id {:order-by [[:position]]})
                                                (t2/hydrate :dimensions
                                                            :has_field_values
                                                            :values))
                dashcard-column-editable?   (or (some-> dashcard-viz :table.editableColumns set)
                                                ;; columns are assumed editable if no dashcard-viz specialisation
                                                (constantly true))
                dashcard-sort               (zipmap (map :name (:table.columns dashcard-viz)) (range))
                field-name->dashcard-column (u/index-by :name (:table.columns dashcard-viz))
                field-sort                  (zipmap (map :name fields) (range))
                sort-key                    (fn [{:keys [name]}]
                                              (or (dashcard-sort name) ; prefer user defined sort in the dashcard
                                                  (+ (inc (count dashcard-sort))
                                                     (field-sort name))))]

            {:title (format "%s: %s" (:display_name table) (u/capitalize-en (name action-kw)))
             :parameters
             (->> (for [field (sort-by sort-key fields)
                        :let [{field-values :values} field
                              pk                     (= :type/PK (:semantic_type field))
                              param-mapping          (field-name->mapping (:name field))
                              dashcard-column        (field-name->dashcard-column (:name field))]
                        :when (case action-kw
                                ;; create does not take pk cols if auto increment, todo generated cols?
                                :table.row/create (not (:database_is_auto_increment field))
                                ;; delete only requires pk cols
                                :table.row/delete pk
                                ;; update takes both the pk and field (if not a row action)
                                :table.row/update true)
                        ;; row-actions can explicitly hide parameters
                        :when (not= "hidden" (:visibility param-mapping))
                        ;; dashcard column context can hide parameters (if defined)
                        :when (:enabled dashcard-column true)
                        :let [required (or pk (:database_required field))]]
                    (u/remove-nils
                     {:id                      (:name field)
                      :display_name            (:display_name field)
                      :semantic_type           (:semantic_type field)
                      :input_type              (field-input-type field field-values)
                      :field_id                (:id field)
                      :human_readable_field_id (-> field :dimensions first :human_readable_field_id)
                      :optional                (not required)
                      :nullable                (:database_is_nullable field)
                      :database_default        (:database_default field)
                      :readonly                (or (= "readonly" (:visibility param-mapping))
                                                   (not (dashcard-column-editable? (:name field))))
                      :value                   (param-value param-mapping row-delay)}))
                  vec)}))]

    (cond
      ;; saved action
      (:action-id unified)
      (describe-saved-action :action-id (:action-id unified))

      ;; table action
      (:action-kw unified)
      (describe-table-action
       {:action-kw     (:action-kw unified)
        ;; todo this should come from applying the (arbitrarily nested) mappings to the input
        ;;      ... and we also need apply-mapping to pull constants out of the form configuration as well!
        :table-id      (or (:table-id (:mapping (:inner-action unified)))
                           (:table-id (:mapping unified))
                           (:table-id input))
        :param-mapping (:param-mapping unified)
        :dashcard-viz  (:dashcard-viz (:dashcard-viz unified))})

      (:inner-action unified)
      (let [inner       (:inner-action unified)
            mapping     (:param-mapping unified)
            dashcard-id (:dashcard-id unified)
            saved-id    (:action-id inner)
            action-kw   (:action-kw inner)
            table-id    (or (:table-id mapping)
                            (:table-id (:mapping inner))
                            (:table-id input)
                            (:table-id scope))
            _           (when-not table-id
                          (throw (ex-info "Must provide table-id" {:status-code 400})))
            row-delay   (delay
                         ;; TODO this is incorrect - in general the row will not come from the table we are acting
                         ;;      upon - this is not even true for our first use case!
                          (when table-id
                            (let [pk-fields    (data-editing/select-table-pk-fields table-id)
                                  pk           (select-keys input (mapv (comp keyword :name) pk-fields))
                                  pk-satisfied (= (count pk) (count pk-fields))]
                              (when pk-satisfied
                                (first (data-editing/query-db-rows table-id pk-fields [pk]))))))]
        (cond
          saved-id
          (describe-saved-action :action-id              saved-id
                                 :row-action-dashcard-id dashcard-id
                                 :param-mapping          mapping
                                 :row-delay              row-delay)

          action-kw
          (describe-table-action :action-kw     action-kw
                                 :table-id      table-id
                                 :param-mapping mapping
                                 :dashcard-viz  (:dashcard-viz unified)
                                 :row-delay     row-delay)

          :else (ex-info "Not a supported row action" {:status-code 500, :scope scope, :unified unified})))
      :else
      (throw (ex-info "Not able to execute given action yet" {:status-code 500, :scope scope, :unified unified})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
