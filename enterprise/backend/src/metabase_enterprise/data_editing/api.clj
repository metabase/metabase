(ns metabase-enterprise.data-editing.api
  (:require
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
    {:created-rows (map :row (:outputs (actions/perform-action! :data-grid/create scope rows)))}))

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
      {:updated (map :row (:outputs (actions/perform-action! :data-grid/update scope rows)))})))

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
              :let [fields (fields-by-table (:id t))
                    action (actions/table-primitive-action t fields op)]]
          (assoc action :table_name (:name t)))

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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
