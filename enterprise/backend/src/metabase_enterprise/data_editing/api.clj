(ns metabase-enterprise.data-editing.api
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.data-editing.configure :as data-editing.configure]
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase-enterprise.data-editing.describe :as data-editing.describe]
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

(declare execute!*)

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (check-permissions)
  (let [scope {:table-id table-id}]
    {:created-rows (map :row (execute!* "data-grid.row/create" scope {} rows))}))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows pks updates]}
   :- [:multi {:dispatch #(cond
                            (:rows %) :mixed-updates
                            (:pks %)  :uniform-updates)}
       [:mixed-updates [:map [:rows [:sequential {:min 1} :map]]]]
       [:uniform-updates [:map
                          [:pks [:sequential {:min 1} :map]]
                          [:updates :map]]]]]
  (check-permissions)
  (if (empty? (or rows pks))
    {:updated []}
    (let [scope   {:table-id table-id}
          rows    (or rows
                      ;; For now, it's just a shim, because we haven't implemented an efficient bulk update action yet.
                      ;; This is a dumb shim; we're not checking that the pk maps are really (just) the pks.
                      (map #(merge % updates) pks))]
      {:updated (map :row (execute!* "data-grid.row/update" scope nil rows))})))

;; This is a POST instead of DELETE as not all web proxies pass on the body of DELETE requests.
(api.macros/defendpoint :post "/table/:table-id/delete"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (check-permissions)
  (let [scope {:table-id table-id}]
    (execute!* "data-grid.row/delete" scope nil rows)
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

(def tmp-action
  "A temporary var for our proxy in [[metabase.actions.api]] to call, until we move this endpoint there."
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
      {:actions (vec (concat saved-actions table-actions))})))

(mr/def ::api-action-id-saved
  "Refers to a row in the actions table."
  ms/PositiveInt)

(mr/def ::api-action-id-primitive-or-dashboard-or-dashcard-action
  "We refer to primitive actions through their names.
  For now we also encode dashboard button and dashcard action ids as strings, but make we can stop that after WRK-483."
  :string)

(mr/def ::api-action-id-packed-mapping
  "The picker currently returns negative integers which encodes certain primitive actions with some config.
  This is just a poor man's ::api-action-expression, so maybe we can deprecate that."
  ms/NegativeInt)

(mr/def ::api-action-id
  "Primitive actions, saved actions, and packed encodings from the picker."
  [:or
   ::api-action-id-saved
   ::api-action-id-primitive-or-dashboard-or-dashcard-action
   ::api-action-id-packed-mapping])

;; TODO this should become sequential so we can save the order.
(mr/def ::action.config.param-map
  "Editable configuration used to transform the inputs passed to an action."
  [:map-of :keyword :any])

(mr/def ::action.config.mappings
  "Non -editable configuration used to transform the inputs passed to an action."
  [:map-of :keyword :any])

(mr/def ::unified-action.base
  [:or
   [:map {:closed true}
    [:action-id ms/PositiveInt]]
   [:map {:closed true}
    [:action-kw :keyword]
    [:mapping {:optional true} [:maybe :map]]]])

;; TODO Regret this name, let's rename it to something like ::action-expression once it's pure data.
(mr/def ::unified-action
  "The internal representation used by our APIs, after we've parsed the relevant ids and fetched their configuration."
  [:or
   ::unified-action.base
   [:map {:closed true}
    ;; TODO Having an opaque id like this inside is not great.
    ;;      We eventually want to have fetched all relevant data already, so we can just dispatch.
    ;; But, for now we're wanting to reuse legacy code which dispatches on the underlying toucan instances, and the
    ;; time has not yet come to refactor those functions.
    ;; TODO make this variant more self-describing, it's not clear that this integer is a dashcard id.
    [:dashboard-action ms/PositiveInt]]
   [:map {:closed true}
    [:inner-action ::unified-action.base]
    [:mapping {:optional true} [:maybe ::action.config.mappings]]
    [:param-map ::action.config.param-map]
    ;; We will eventually want to generalize to support grids outside of dashboards.
    [:dashcard-id {:optional true} ms/PositiveInt]
    [:configurable {:optional true} :boolean]]])

(mr/def ::api-action-expression
  "A more relaxed version of ::unified-action that can still have opaque ::api-action-id expressions inside."
  ;; TODO let's wait until we've written all our API tests and integrated the FE before typing this.
  :map)

(mr/def ::api-action-id-or-expression
  "All the various ways of referring to an action with the v2 APIs."
  [:or ::api-action-expression ::api-action-id])

(mu/defn- fetch-unified-action :- ::unified-action
  "Resolve various flavors of action-id into plain data, making it easier to dispatch on. Fetch config etc."
  [scope :- ::types/scope.hydrated
   raw-id :- ::api-action-id-or-expression]
  (cond
    (map? raw-id) (if-let [packed-id (:packed-id raw-id)]
                    (merge
                     {:inner-action (fetch-unified-action scope packed-id)}
                     (dissoc raw-id :packed-id))
                    raw-id)
    (pos-int? raw-id) {:action-id raw-id}
    (neg-int? raw-id) (let [[op param] (actions/unpack-encoded-action-id raw-id)]
                        (cond
                          (isa? op :table.row/common)
                          {:action-kw op
                           :mapping {:table-id param :row ::root}}
                          :else
                          (throw (ex-info "Execution not supported for given encoded action" {:status    400
                                                                                              :action-id raw-id
                                                                                              :op        op
                                                                                              :param     param}))))
    (string? raw-id) (if-let [[_ dashcard-id _nested-id] (re-matches #"^dashcard:([^:]+):(.*)$" raw-id)]
                       ;; There is a chicken-and-egg problem with creating actions inside dashcards.
                       ;; we need to put their action id (which references the dashcard id) inside the viz settings,
                       ;; before we save the dashcard for the first time, which only then generates its primary key.
                       (let [dashcard-id (when (not= "unknown" dashcard-id) (parse-long dashcard-id))
                             ;; So, if we only have a placeholder for the dashcard id, get it from the scope.
                             ;; This hack always works since the frontend can't invoke row actions from anywhere else.
                             ;; From a semantic point of view, this hack still sucks. It'll be fixed by WRK-483.
                             dashcard-id (if (pos-int? dashcard-id) dashcard-id (:dashcard-id scope))
                             dashcard    (api/check-404 (some->> dashcard-id (t2/select-one [:model/DashboardCard :visualization_settings])))
                             ;; TODO: this should belong to our configuration
                             actions     (-> dashcard :visualization_settings ((some-fn :editableTable.enabledActions :table.enabled_actions)))
                             viz-action  (api/check-404 (first (filter (comp #{raw-id} :id) actions)))
                             inner-id    (:actionId viz-action)
                             inner       (fetch-unified-action scope inner-id)
                             action-type (:actionType viz-action "data-grid/row-action")
                             mapping     (:mapping viz-action)
                             ;; TODO we should do this *later* because it's lossy - we lose the configured ordering.
                             param-map   (->> (:parameterMappings viz-action {})
                                              (u/index-by :parameterId #(dissoc % :parameterId))
                                              walk/keywordize-keys)]
                         (assert (:enabled viz-action true) "Cannot call disabled actions")
                         (case action-type
                           ("data-grid/built-in"
                            "data-grid/row-action")
                           {:inner-action inner
                            :mapping      mapping
                            :param-map    param-map
                            :dashcard-id  dashcard-id
                            :configurable (not= action-type "data-grid/built-in")}))
                       (if-let [[_ dashcard-id] (re-matches #"^dashcard:(\d+)$" raw-id)]
                         ;; Dashboard buttons can only be invoked from dashboards
                         ;; We're not checking that the scope has the correct dashboard, but if it's incorrect, there
                         ;; will be a 404 thrown when we try to execute the action.
                         ;; This 404 here is not the best error to return, but we can polish this later.
                         (let [dashboard-id (api/check-404 (:dashboard-id scope))]
                           (api/read-check :model/Dashboard dashboard-id)
                           {:dashboard-action (parse-long dashcard-id)})
                         (if (re-matches u/uuid-regex raw-id)
                           (throw (ex-info "Cannot execute an unsaved action given only its temporary id"
                                           {:status-code 400, :action-id raw-id}))
                           ;; Not a fancy encoded string, it must refer directly to a primitive.
                           (let [kw (keyword raw-id)]
                             {:action-kw kw
                              :mapping   (actions/default-mapping kw scope)}))))
    :else
    (throw (ex-info "Unexpected id value" {:status-code 400, :action-id raw-id}))))

(defn- hydrate-mapping [mapping]
  (walk/postwalk-replace
   {"::root"   ::root
    "::key"    ::key
    "::input"  ::input
    "::params" ::params
    "::param"  ::param}
   mapping))

(defn- augment-params
  [{:keys [dashcard-id param-map] :as _action} input params]
  ;; TODO cool optimization where we don'l fetch the row-data from the db if we only need the pk (or a subset of the pk)
  (let [row (delay (let [{:keys [table_id]} (actions/cached-value
                                             [:dashcard-viz dashcard-id]
                                             #(t2/select-one-fn :visualization_settings :model/DashboardCard dashcard-id))]
                     (if-not table_id
                       ;; this is not an Editable, it must be a question - so we use the client-side row
                       (update-keys input name)
                       ;; TODO batch fetching all these rows, across all inputs
                       (let [fields    (t2/select [:model/Field :id :name :semantic_type] :table_id table_id)
                             pk-fields (filter #(= :type/PK (:semantic_type %)) fields)
                             ;; TODO we could restrict which fields we fetch in future
                             [row]     (data-editing/query-db-rows table_id pk-fields [input])
                             _         (api/check-404 row)]
                         ;; TODO i would much prefer if we used field-ids and not names in the configuration
                         (update-keys row name)))))]
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
         "row-data" (assoc acc k (get @row (:sourceValueTarget v)))
         ;; no mapping? omit the key
         nil acc))
     (merge input params)
     param-map)))

(defn- apply-mapping [{:keys [mapping] :as action} params inputs]
  (let [mapping (hydrate-mapping mapping)
        tag?    #(and (vector? %2) (= %1 (first %2)))]
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
             (= ::root x)   root
             (= ::input x)  input
             (= ::params x) params
             ;; specific key
             (tag? ::key x)   (get root (keyword (second x)))
             (tag? ::param x) (get params (keyword (second x)))
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
      (throw (ex-info "Not able to execute given action yet" {:status-code 500 :scope scope :unified unified})))))

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
         [:action_id ::api-action-id-or-expression]
         [:scope     ::types/scope.raw]
         [:params    {:optional true} :map]
         [:input     :map]]]
    {:outputs (execute!* action_id scope params [input])}))

(def execute-bulk
  "A temporary var for our proxy in [[metabase.actions.api]] to call, until we move this endpoint there."
  (api.macros/defendpoint :post "/action/v2/execute-bulk"
    "The *other* One True API for invoking actions. The only difference is that it accepts multiple inputs."
    [{}
     {}
     {:keys [action_id scope inputs params]}
     :- [:map
         [:action_id               ::api-action-id-or-expression]
         [:scope                   ::types/scope.raw]
         [:inputs                  [:sequential :map]]
         [:params {:optional true} [:map-of :keyword :any]]]]
    {:outputs (execute!* action_id scope params inputs)}))

(defn- row-data-mapping
  ;; TODO get this working with arbitrary nesting of inner actions
  "HACK: create a placeholder unified action who will map to the values we need from row-data, if we need any"
  [{:keys [param-map] :as action}]
  ;; We create a version of the action that will "map" to an input which is just the row data itself.
  (let [row-data-mapping (u/for-map [[id {:keys [sourceType sourceValueTarget]}] param-map
                                     :when (= "row-data" sourceType)]
                           [id [::key (keyword sourceValueTarget)]])]
    (when (seq row-data-mapping)
      {:inner-action {:action-kw :placeholder}
       :dashcard-id  (:dashcard-id action)
       :param-map    param-map
       :mapping      row-data-mapping})))

(defn- get-row-data
  "For a row or header action, fetch underlying database values that'll be used for specific action params in mapping."
  [action input]
  ;; it would be nice to avoid using "apply-mapping" twice (once here on this stub action, once later on the real one)
  (some-> (row-data-mapping action)
          (apply-mapping-nested nil [input])
          first
          not-empty))

;; test case

(comment
  (get-row-data {:inner-action {:mapping {:table-id 3, :row ::root}}
                 :param-map    {:customer_id {:sourceType "row-data", :sourceValueTarget "id"}
                                :engineer    {:sourceType "ask-user"}}
                 ;; because we don't have a dashcard with this id to map to a table, our code treats it like a Question instead of an Editable
                 :dashcard-id  3}
                {:id 3}))

(def tmp-modal
  "A temporary var for our proxy in [[metabase.actions.api]] to call, until we move this endpoint there."
  (api.macros/defendpoint :post "/tmp-modal"
    "Temporary endpoint for describing an actions parameters
    such that they can be presented correctly in a modal ahead of execution."
    [{}
     {}
     ;; TODO support for bulk actions
     {:keys [action_id scope input]}]
    (let [scope         (actions/hydrate-scope scope)
          unified       (fetch-unified-action scope action_id)
          row-data      (get-row-data unified input)
          partial-input (first (apply-mapping-nested unified nil [input]))]
      (data-editing.describe/describe-unified-action unified scope row-data partial-input))))

(def configure
  "A temporary var for our proxy in [[metabase.actions.api]] to call, until we move this endpoint there."
  (api.macros/defendpoint :post "/configure-form"
    "This API returns a data representation of the form the FE will render. It does not update the configuration."
    [{}
     {}
     ;; TODO pour some malli on me
     {:keys [action_id scope]}]
    (let [scope (actions/hydrate-scope scope)]
      (data-editing.configure/configuration (fetch-unified-action scope action_id) scope))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
