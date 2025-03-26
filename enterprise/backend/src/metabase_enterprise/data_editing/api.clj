(ns metabase-enterprise.data-editing.api
  (:require
   [clojure.data :refer [diff]]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver :as driver]
   [metabase.events :as events]
   [metabase.events.notification :as events.notification]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.upload :as-alias upload]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- perform-bulk-action! [action-kw table-id rows]
  (api/check-superuser)
  (actions/perform-action! action-kw
                           {:database (api/check-404 (t2/select-one-fn :db_id [:model/Table :db_id] table-id))
                            :table-id table-id
                            :arg      rows}
                           :policy   :data-editing))

(doseq [topic [:event/data-editing-row-create
               :event/data-editing-row-update
               :event/data-editing-row-delete]]
  (defmethod events.notification/notification-filter-for-topic topic
    [_topic event-info]
    (assert (:table_id event-info) "Event info must contain :table_id")
    [:= :table_id (:table_id event-info)]))

(defn- qp-result->row-map
  [{:keys [rows cols]}]
  ;; rows from the request are keywordized
  (let [col-names (map (comp keyword :name) cols)]
    (map #(zipmap col-names %) rows)))

(defn- table-id->pk
  [table-id]
  ;; TODO: support composite PKs
  (api/check-404 (t2/select-one :model/Field :table_id table-id :semantic_type :type/PK)))

(defn- get-row-pk
  [pk-field row]
  (get row (keyword (:name pk-field))))

(defn- query-db-rows
  [table-id pk-field rows]
  (let [{:keys [db_id]} (api/check-404 (t2/select-one :model/Table table-id))]
    (assert pk-field "Table must have a primary key")
    (assert (every? (partial get-row-pk pk-field) rows) "All rows must have the primary key")
    (when-let [pk-values (seq (map (partial get-row-pk pk-field) rows))]
      (qp.store/with-metadata-provider db_id
        (let [mp    (qp.store/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp table-id))
                        (lib/filter (apply lib/in (lib.metadata/field mp (:id pk-field)) pk-values))
                        qp/userland-query-with-default-constraints)]
          (->> (qp/process-query query)
               :data
               qp-result->row-map
               (m/index-by #(get-row-pk pk-field %))))))))

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (let [res (perform-bulk-action! :bulk/create table-id rows)]
    (doseq [row (:created-rows res)]
      (events/publish-event! :event/data-editing-row-create
                             {:table_id    table-id
                              :created_row row
                              :actor_id    api/*current-user-id*}))
    res))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (if (empty? rows)
    {:updated []}
    (let [pk-field   (table-id->pk table-id)
          id->db-row (query-db-rows table-id pk-field rows)]
      (doseq [row rows]
        (let [;; well, this is a trick, but I haven't figured out how to do single row update
              result        (:rows-updated (perform-bulk-action! :bulk/update table-id [row]))
              row-before    (get id->db-row (get-row-pk pk-field row))
              [_ changes _] (diff row-before row)]
          (when (pos-int? result)
            (events/publish-event! :event/data-editing-row-update
                                   {:table_id    table-id
                                    :updated_row row
                                    :before_row  row-before
                                    :changes     changes
                                    :actor_id    api/*current-user-id*}))))
      {:updated (vals (query-db-rows table-id pk-field rows))})))

(api.macros/defendpoint :post "/table/:table-id/delete"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]} :- [:map [:rows [:sequential {:min 1} :map]]]]
  (let [pk-field    (table-id->pk table-id)
        id->db-rows (query-db-rows table-id pk-field rows)
        res         (perform-bulk-action! :bulk/delete table-id rows)]
    (doseq [row rows]
      (events/publish-event! :event/data-editing-row-delete
                             {:table_id    table-id
                              :deleted_row (get id->db-rows (get-row-pk pk-field row))
                              :actor_id    api/*current-user-id*}))
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
    :keys [primary_key columns]}
   :-
   [:map
    [:name Identifier]
    [:primary_key [:seqable {:min-count 1} Identifier]]
    [:columns [:seqable
               [:map
                [:name Identifier]
                [:type ColumnType]]]]]]
  (api/check-superuser)
  (let [{driver :engine :as database} (api/check-404 (t2/select-one :model/Database db-id))
        _ (actions/check-data-editing-enabled-for-database! database)
        column-map (->> (for [{column-name :name
                               column-type :type} columns]
                          [column-name (ensure-database-type driver column-type)])
                        (into {}))]
    (driver/create-table! driver db-id table-name column-map :primary-key (map keyword primary_key))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
