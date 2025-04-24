(ns metabase-enterprise.data-editing.api
  (:require
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase-enterprise.data-editing.undo :as undo]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver :as driver]
   [metabase.models.field-values :as field-values]
   [metabase.upload :as-alias upload]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- invalidate-field-values! [table-id rows]
  (let [field-name-xf (comp (mapcat keys)
                            (distinct)
                            (map name)
                            (map u/lower-case-en))
        field-names (into #{} field-name-xf rows)
        fields (when (seq field-names)
                 (t2/select :model/Field
                            :table_id table-id
                            :name [:in field-names]
                            :has_field_values [:in ["list" "auto-list"]]))]
    (run! field-values/create-or-update-full-field-values! fields)))

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
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (check-permissions)
  (let [rows'      (data-editing/apply-coercions table-id rows)
        res        (data-editing/insert! api/*current-user-id* table-id rows')
        pk-fields  (data-editing/select-table-pk-fields table-id)
        ;; actions code does not return coerced values
        ;; right now the FE works off qp outputs, which coerce output row data
        ;; still feels messy, revisit this
        pks->db-row (data-editing/query-db-rows table-id pk-fields (map #(update-keys % keyword) (:created-rows res)))]
    (invalidate-field-values! table-id rows')
    {:created-rows (vals pks->db-row)}))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (check-permissions)
  (if (empty? rows)
    {:updated []}
    (let [rows'        (data-editing/apply-coercions table-id rows)
          pk-fields    (data-editing/select-table-pk-fields table-id)
          pks->db-row  (data-editing/query-db-rows table-id pk-fields rows')
          user-id      api/*current-user-id*]
      ;; If this fails, we probably have another bug like the type-mismatch issue we had here:
      ;; https://linear.app/metabase/issue/WRK-281/undo-deletes-a-record-instead-of-reverting-the-edits
      ;; TODO this bombs in [[metabase-enterprise.data-editing.api-test/editing-allowed-test]] because we
      ;;      haven't done the perms check yet.
      #_(assert (every? (fn [row] (get pks->db-row (data-editing/get-row-pks pk-fields row))) rows')
                "Able to look up the existing values of these rows, for system events")
      (data-editing/perform-bulk-action! :bulk/update table-id rows')
      ;; TODO this should also become a subscription to the "data written" system event
      (let [row-pk->old-new-values (->> (for [row rows']
                                          (let [pks (data-editing/get-row-pks pk-fields row)]
                                            [pks [(get pks->db-row pks)
                                                  row]]))
                                        (into {}))]
        (undo/track-change! user-id {table-id row-pk->old-new-values}))

      (invalidate-field-values! table-id rows')
      {:updated (vals (data-editing/query-db-rows table-id pk-fields rows'))})))

;; This is a POST instead of DELETE as not all web proxies pass on the body of DELETE requests.
(api.macros/defendpoint :post "/table/:table-id/delete"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (check-permissions)
  (let [pk-fields              (data-editing/select-table-pk-fields table-id)
        pks->db-rows           (data-editing/query-db-rows table-id pk-fields rows)
        ;; If this fails, we probably have another bug like the type-mismatch issue we had here:
        ;; https://linear.app/metabase/issue/WRK-281/undo-deletes-a-record-instead-of-reverting-the-edits
        ;; TODO this bombs in [[metabase-enterprise.data-editing.api-test/editing-allowed-test]] because we
        ;;      haven't done the perms check yet.
        _                      nil #_(assert (every? (fn [row] (get pks->db-rows (data-editing/get-row-pks pk-fields row))) rows)
                                             "Able to look up the existing values of these rows, for system events")
        res                    (data-editing/perform-bulk-action! :bulk/delete table-id rows)
        user-id                api/*current-user-id*
        row-pk->old-new-values (->> (for [row rows]
                                      (let [pks (data-editing/get-row-pks pk-fields row)]
                                        [pks [(get pks->db-rows pks) nil]]))
                                    (into {}))]
    ;; TODO this should also become a subscription to the "data written" system event
    (undo/track-change! user-id {table-id row-pk->old-new-values})
    res))

;; might later be changed, or made driver specific, we might later drop the requirement depending on admin trust
;; model (e.g are admins trusted with writing arbitrary SQL cases anyway, will non admins ever call this?)
(def ^:private Identifier
  "A malli schema for strings that can be used as SQL identifiers"
  [:re #"^[\w\- ]+$"])

;; upload types are used temporarily, I expect this to change
(def ^:private column-type->upload-type
  {"auto_incrementing_int_pk" ::upload/auto-incrementing-int-pk
   "boolean"                  ::upload/boolean
   "int"                      ::upload/int
   "float"                    ::upload/float
   "varchar255"               ::upload/varchar-255
   "text"                     ::upload/text
   "date"                     ::upload/date
   "datetime"                 ::upload/datetime
   "offset_datetime"          ::upload/timestamp-with-time-zone})

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

(api.macros/defendpoint :post "/undo"
  "Undo the last change you made.
  For now only supports tables, but in future will support editables for sure.
  Maybe actions, workflows, etc.
  Could even generalize to things like edits to dashboard definitions themselves."
  [_
   _
   {:keys [table-id no-op]}] :- [:map
                                 [:table-id ms/PositiveInt]
                                 [:no-op {:optional true} ms/BooleanValue]]
  (check-permissions)
  (api/check-404 (t2/select-one-pk :model/Table table-id))
  (let [user-id api/*current-user-id*]
    (if no-op
      {:batch_num (undo/next-batch-num true user-id table-id)}
      ;; IDEA encapsulate this in an action
      ;; IDEA use generic action calling API instead of having this endpoint
      (try
        {:result (undo/undo! user-id table-id)}
        (catch ExceptionInfo e
          (throw (translate-undo-error e)))))))

(api.macros/defendpoint :post "/redo"
  "Redo the last change you made.
  For now only supports tables, but in future will support editables for sure.
  Maybe actions, workflows, etc.
  Could even generalize to things like edits to dashboard definitions themselves."
  [_
   _
   {:keys [table-id no-op]}] :- [:map
                                 [:table-id ms/PositiveInt]
                                 [:no-op {:optional true} ms/BooleanValue]]
  (check-permissions)
  (api/check-404 (t2/select-one :model/Table table-id))
  (let [user-id api/*current-user-id*]
    (if no-op
      {:batch_num (undo/next-batch-num false user-id table-id)}
      ;; IDEA encapsulate this in an action
      ;; IDEA use generic action calling API instead of having this endpoint
      ;; TODO translate errors to http codes
      (try
        {:result (undo/redo! user-id table-id)}
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
  (let [action             (-> (actions/select-action :id (parse-long action-id) :archived false)
                               (t2/hydrate :creator)
                               api/read-check)
        card-id            (api/check-404 (t2/select-one-fn :card_id [:model/DashboardCard :card_id] dashcard-id))
        table-id           (api/check-404 (t2/select-one-fn :table_id [:model/Card :table_id] card-id))
        fields             (t2/select [:model/Field :name] :table_id table-id)
        field-names        (set (map :name fields))
        include?           #(not (contains? field-names (:slug %)))]
    (update action :parameters #(some->> % (filterv include?)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
