(ns metabase-enterprise.data-editing.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase-enterprise.data-editing.undo :as undo]
   [metabase.actions.core :as actions]
   [metabase.actions.types :as types]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

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
    {:created-rows (:outputs (actions/perform-action! :data-grid/create scope rows))}))

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
      {:updated (:outputs (actions/perform-action! :data-grid/update scope rows))})))

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
    (actions/perform-action! :data-grid/delete scope rows)
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

(defn- translate-undo-error [e]
  (case (:error (ex-data e))
    :undo/none            (ex-info (tru "Nothing to do")                                         {:status-code 204} e)
    :undo/cannot-undelete (ex-info (tru "You cannot undo your previous change.")                 {:status-code 405} e)
    :undo/conflict        (ex-info (tru "Your previous change has a conflict with another edit") {:status-code 409} e)
    e))

(defn- perform-and-group-undo! [action-kw scope]
  (->> (actions/perform-action! action-kw scope [{}])
       :outputs
       (u/group-by :table-id (juxt :action-type :row))))

(api.macros/defendpoint :post "/undo"
  "Undo the last change you made.
  For now only supports tables, but in the future will support editables for sure.
  Maybe actions, workflows, etc.
  Could even generalize to things like edits to dashboard definitions themselves."
  [_
   _
   {:keys [table-id scope no-op]}] :- [:map
                                       ;; deprecated, this will be replaced by scope
                                       [:table-id ms/PositiveInt]
                                       [:scope ::types/scope.raw]
                                       [:no-op {:optional true} ms/BooleanValue]]
  (check-permissions)
  (let [user-id api/*current-user-id*
        scope  (or scope {:table-id table-id})]
    (if no-op
      {:batch_num (undo/next-batch-num :undo user-id scope)}
      ;; IDEA use generic action calling API instead of having this endpoint
      (try
        {:result (perform-and-group-undo! :data-editing/undo scope)}
        (catch ExceptionInfo e
          (throw (translate-undo-error e)))))))

(api.macros/defendpoint :post "/redo"
  "Redo the last change you made.
  For now only supports tables, but in the future will support editables for sure.
  Maybe actions, workflows, etc.
  Could even generalize to things like edits to dashboard definitions themselves."
  [_
   _
   {:keys [table-id scope no-op]}] :- [:map
                                         ;; deprecated, this will be replaced by scope
                                       [:table-id ms/PositiveInt]
                                       [:scope ::types/scope.raw]
                                       [:no-op {:optional true} ms/BooleanValue]]
  (check-permissions)
  (let [scope (or scope {:table-id table-id})]
    (if no-op
      {:batch_num (undo/next-batch-num :redo api/*current-user-id* scope)}
      ;; IDEA use generic action calling API instead of having this endpoint
      (try
        {:result (perform-and-group-undo! :data-editing/redo scope)}
        (catch ExceptionInfo e
          (throw (translate-undo-error e)))))))

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
        card-id     (api/check-404 (t2/select-one-fn :card_id [:model/DashboardCard :card_id] dashcard-id))
        table-id    (api/check-404 (t2/select-one-fn :table_id [:model/Card :table_id] card-id))
        fields      (t2/select [:model/Field :name] :table_id table-id)
        field-names (set (map :name fields))
        include?    #(not (contains? field-names (:slug %)))]
    (update action :parameters #(some->> % (filterv include?)))))

(api.macros/defendpoint :post "/row-action/:action-id/execute"
  "Executes an action as a row action. The allows action parameters sharing a name with column names to be derived from a specific row.
  The caller is still able to supply parameters, which will be preferred to those derived from the row.
  Discovers the table via the provided dashcard-id, assumes a model/editable for now."
  [{:keys [action-id]}   :- [:map [:action-id :string]]
   {:keys [dashcard-id]} :- [:map [:dashcard-id ms/PositiveInt]]
   {:keys [pk params]}   :- [:map
                             [:pk :any]
                             [:params :any]]]
  (let [action      (-> (actions/select-action :id (parse-long action-id) :archived false)
                        (t2/hydrate :creator)
                        api/read-check)
        card-id     (api/check-404 (t2/select-one-fn :card_id [:model/DashboardCard :card_id] dashcard-id))
        table-id    (api/check-404 (t2/select-one-fn :table_id [:model/Card :table_id] card-id))
        fields      (t2/select [:model/Field :id :name :semantic_type] :table_id table-id)
        field-names (set (map :name fields))
        pk-fields   (filter #(= :type/PK (:semantic_type %)) fields)
        [row]       (data-editing/query-db-rows table-id pk-fields [pk])
        _           (api/check-404 row)
        row-params  (->> (:parameters action)
                         (keep (fn [{:keys [id slug]}]
                                 (when (contains? field-names (or slug id))
                                   [id (row (keyword (or slug id)))])))
                         (into {}))
        param-id    (u/index-by (some-fn :slug :id) :id (:parameters action))
        provided    (update-keys params #(api/check-400 (param-id (name %)) "Unexpected parameter provided"))]
    (actions/execute-action! action (merge row-params provided))))

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
          (t2/select :model/Table :db_id [:in (map :id editable-databases)]))

        fields
        (when (seq editable-tables)
          (t2/select :model/Field :table_id [:in (map :id editable-tables)]))

        fields-by-table
        (group-by :table_id fields)

        table-actions
        (for [t editable-tables
              op [:table.row/create :table.row/update :table.row/delete]
              :let [fields (fields-by-table (:id t))]]
          (actions/table-primitive-action t fields op))

        model-actions
        (for [a (actions/select-actions nil :archived false)]
          (select-keys a [:name
                          :model_id
                          :type
                          :database_id
                          :id
                          :visualization_settings
                          :parameters]))]
    {:actions (vec (concat model-actions table-actions))}))

(def Action
  "Malli schema for an action (name or id)"
  [:union :string ms/PositiveInt])

(let [Button
      [:map [:text :string]]

      SimpleJsonValue
      [:union :nil :boolean number? :string]

      FieldExpr
      [:map
       [:type [:enum "field"]]
       ;; what does this actually mean
       [:field_id ms/PositiveInt]]

      ConstExpr
      [:map
       [:type [:enum "const"]]
       [:value SimpleJsonValue]]

      Expr
      [:multi {:dispatch :type}
       ["field" FieldExpr]
       ["const" ConstExpr]]

      FreeMapping
      [:map
       [:type [:enum "free"]]
       [:default {:optional true} Expr]
       [:placeholder {:optional true} Expr]]

      ExprMapping
      [:map
       [:type [:enum "expr"]]
       [:expr Expr]
       [:show_readonly {:optional true} :boolean]]

      OmitMapping
      [:map
       [:type [:enum "omit"]]
       [:show_readonly {:optional true} :boolean]]

      DashboardFilterMapping
      [:map
       [:type [:enum "dashboard_filter"]]
       [:id ms/PositiveInt]
       [:show_readonly {:optional true} :boolean]]

      ParameterMapping
      [:multi {:dispatch :type}
       ["free"             FreeMapping]
       ["expr"             ExprMapping]
       ["omit"             OmitMapping]
       ["dashboard_filter" DashboardFilterMapping]]]

  (def Mapping
    "Malli schema for an action mapping."
    [:map
     [:title      {:optional true} :string]
     [:header     {:optional true} :string]
     [:footer     {:optional true} :string]
     [:confirm    {:optional true} Button]
     [:cancel     {:optional true} Button]
     [:parameters {:optional true} [:map-of :string ParameterMapping]]]))

(api.macros/defendpoint :post "/action/describe"
  [{}
   {}
   {:keys [;; pks and table-id or dashcard-id or dashboard-id?
           scope
           ;; number or qualified string
           action]} :- [:map
                        [:scope ::types/scope.raw]
                        [:action Action]]]
  (def scope scope)
  (def action action)
  (letfn [(table-id-parameter [tbl-id #_param-mapping]
            (merge
             {:arg-path "table_id"
              :type "type/Integer"
              :nullable false
              :optional false
              :display_name "Table"
              :description ""
              :field_id nil
              :editable false
              :placeholder nil
              :database_default nil
              ;; should table-id be mappable? means I need to write the mapping resolve code (Chris collision)
              #_#_:mapping (or param-mapping {:type ""})
              ;; if will be shown to the user in modals
              :visible (not tbl-id)}
             ;; pure /describe (admin/author) lets you know about the mapped value
             (when tbl-id {:value tbl-id})))
          (parameter-placeholder [field param-mapping]
            ;; todo impl
            nil)
          (parameter-editable? [field param-mapping]
            ;; todo impl
            true)
          (make-arg-path [components]
            (str/join ":" (map u/qualified-name components)))
          (field-parameter [field arg-path mapping]
            (let [param-mapping (get-in mapping [:parameters arg-path])
                  pk (= :type/PK (:semantic_type field))
                  required (or pk (:database_required field))]
              {:arg-path arg-path
               :type (:base_type field)
               :nullable (:database_is_nullable field)
               :optional (not required)
               :display_name (:display_name field)
               :description (:description field)
               ;; need to be precise about what this means
               ;; 'conforms to constraints' or something
               :field_id (:id field)
               :editable (parameter-editable? field param-mapping)
               :placeholder (parameter-placeholder field param-mapping)
              ;; for displaying database default expression
               :database_default (:database_default field)
               ;; todo do I keep this or require joins?
               :mapping (or param-mapping
                            ;; should default from field?
                            {:type "free"})}))
          (describe-create [root-action table fields mapping]
            {:id root-action
             :shortname "Create"
             ;; later allow specialisation of this stuff via mapping
             :title (:title mapping (format "Create '%s' records" (:display_name table)))
             :header ""
             :footer ""
             :confirm {:text "Insert"}
             :cancel {:text "Cancel"}
             :parameters
             (into
              [(table-id-parameter (:id table))]
              (for [field fields
                    :let [arg-path (make-arg-path ["row" (:name field)])]]
                (field-parameter field arg-path mapping)))})
          (describe-update [root-action table fields mapping]
            {:id root-action
             :shortname "Update"
             :title (format "Update '%s' records" (:display_name table))
             :header ""
             :footer ""
             :confirm {:text "Update"}
             :cancel {:text "Cancel"}
             :parameters
             (into
              [(table-id-parameter (:id table))]
              (for [field fields
                    :let [arg-path (make-arg-path ["row" (:name field)])]]
                (field-parameter field arg-path mapping)))})
          (describe-delete [root-action table fields mapping]
            {:id root-action
             :shortname "Delete"
             :title (format "Delete '%s' records" (:display_name table))
             :header ""
             :footer ""
             :confirm {:text "Delete"}
             :cancel {:text "Cancel"}
             :parameters
             (into
              [(table-id-parameter (:id table))]
              (for [field fields
                    :when (= :type/PK (:semantic_type field))
                    :let [arg-path (make-arg-path ["row" (:name field)])]]
                (field-parameter field arg-path mapping)))})
          (describe-table-action-without-table [root-action shortname desc mapping]
            {:id root-action
             :shortname shortname
             :title (:title mapping desc)
             :header ""
             :footer ""
             :confirm {:text "Confirm"}
             :cancel {:text "Cancel"}
             :parameters [(table-id-parameter nil)]})
          (describe-table-action [root-action action table-id mapping]
            (let [prim-map
                  {"table.row/create" [describe-create "Insert" "Inserts records into a table"]
                   "table.row/update" [describe-update "Update" "Updates records in a table"]
                   "table.row/delete" [describe-delete "Update" "Deletes records in a table"]}
                  [describe-fn
                   no-table-name
                   no-table-desc] (api/check-404 (prim-map action))]
              (if table-id
                (let [table  (api/check-404 (t2/select-one :model/Table table-id))
                      fields (t2/select :model/Field :table_id table-id {:order-by [[:database_position :asc]]})]
                  (describe-fn root-action table fields mapping))
                ;; not sure I need this branch, scope _must_ have enough to get to a table?!
                (describe-table-action-without-table root-action no-table-name no-table-desc mapping))))
          (describe-model-action [root-action action mapping]
            (let [action-record (t2/select-one :model/Action action)]
              ;; todo fill in
              {:id root-action}))
          (describe-mapped-action [root-action
                                   {:keys [base-action
                                           table-id
                                           mapping]}]
            ;; later once mapped actions have their own database table
            ;; you might be able to stack mapping on top on one another without limit
            (if (string? base-action)
              (describe-table-action root-action base-action table-id mapping)
              (describe-model-action root-action base-action mapping)))]
    (let [hydrated-scope (actions/hydrate-scope scope)

          {:keys [dashcard-id]}
          hydrated-scope

          dashcard-viz
          (t2/select-one-fn :visualization_settings :model/DashboardCard dashcard-id)

          mapped-dashcard-action
          (when dashcard-id
            ;; yuk have to use interned kw as a the dashcard key :(
            (get-in dashcard-viz [:action_mappings (keyword action)]))]

      (def dashcard-viz dashcard-viz)
      (def mapped-dashcard-action mapped-dashcard-action)

      (cond
        mapped-dashcard-action
        {:action (describe-mapped-action action mapped-dashcard-action)
         :mapping mapped-dashcard-action}

        (number? action)
        {:action (describe-model-action action action nil)
         :mapping nil}

        :else
        {:action (describe-table-action action action (:table-id hydrated-scope) nil)
         :mapping nil}))))

(api.macros/defendpoint :post "/action/map"
  [_
   _
   {:keys [action
           base-action
           scope
           mapping]} :- [:map
                         [:action {:optional true} Action]
                         [:base-action Action]
                         [:scope ::types/scope.raw]
                         [:mapping Mapping]]]
  (let [hydrated-scope (actions/hydrate-scope scope)
        {:keys [dashcard-id]} hydrated-scope
        _ (api/check-400 dashcard-id "Need at least dashcard-id in the scope")
        viz (t2/select-one-fn :visualization_settings :model/DashboardCard)
        action' (or action (u/generate-nano-id))
        new-viz (assoc-in viz [:action_mappings action'] {:base-action base-action, :mapping mapping, :table-id (:table-id hydrated-scope)})]
    (t2/update! :model/DashboardCard dashcard-id {:visualization_settings new-viz})
    {:action action'}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
