(ns metabase-enterprise.data-editing.api
  (:require
   [clojure.data :refer [diff]]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events :as events]
   [metabase.events.notification :as events.notification]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
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
          (-> (qp/process-query query)
              :data
              qp-result->row-map
              (#(group-by (fn [x] (get x (keyword (:name pk-field)))) %))
              (update-vals first)))))))

(api.macros/defendpoint :post "/table/:table-id"
  "Insert row(s) into the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (let [created-rows (:created-rows (perform-bulk-action! :bulk/create table-id rows))]
    (doseq [row created-rows]
      (events/publish-event! :event/data-editing-row-create
                             {:table_id    table-id
                              :created_row row
                              :actor_id    api/*current-user-id*}))))

(api.macros/defendpoint :put "/table/:table-id"
  "Update row(s) within the given table."
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
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
                                  :actor_id    api/*current-user-id*}))))))

(api.macros/defendpoint :delete "/table/:table-id"
  "Delete row(s) from the given table"
  [{:keys [table-id]} :- [:map [:table-id ms/PositiveInt]]
   {}
   {:keys [rows]}]
  (let [pk-field    (table-id->pk table-id)
        id->db-rows (query-db-rows table-id pk-field rows)]
    (perform-bulk-action! :bulk/delete table-id rows)
    (doseq [row rows]
      (events/publish-event! :event/data-editing-row-delete
                             {:table_id    table-id
                              :deleted_row (get id->db-rows (get-row-pk pk-field row))
                              :actor_id    api/*current-user-id*}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-editing routes."
  (api.macros/ns-handler *ns* +auth))
