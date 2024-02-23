(ns metabase.models.table
  (:require
   [metabase.db.connection :as mdb.connection]
   [metabase.db.util :as mdb.u]
   [metabase.driver :as driver]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :refer [FieldValues]]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Constants + Entity -----------------------------------------------

(def visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`).
   (Basically any non-nil value is a reason for hiding the table.)"
  #{:hidden :technical :cruft})

(def field-orderings
  "Valid values for `Table.field_order`.
  `:database`     - use the same order as in the table definition in the DB;
  `:alphabetical` - order alphabetically by name;
  `:custom`       - the user manually set the order in the data model
  `:smart`        - Try to be smart and order like you'd usually want it: first PK, followed by `:type/Name`s, then
                    `:type/Temporal`s, and from there on in alphabetical order."
  #{:database :alphabetical :custom :smart})

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(def Table
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all the Table symbol in our codebase."
  :model/Table)

(methodical/defmethod t2/table-name :model/Table [_model] :metabase_table)

(doto :model/Table
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Table
  {:entity_type     mi/transform-keyword
   :visibility_type mi/transform-keyword
   :field_order     mi/transform-keyword})

(methodical/defmethod t2/model-for-automagic-hydration [:default :table]
  [_original-model _k]
  :model/Table)

(t2/define-before-insert :model/Table
  [table]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name table))
                  :field_order  (driver/default-field-order (t2/select-one-fn :engine Database :id (:db_id table)))}]
    (merge defaults table)))

(t2/define-before-delete :model/Table
  [{:keys [db_id schema id]}]
  (t2/delete! Permissions :object [:like (str "%" (perms/data-perms-path db_id schema id) "%")]))

(defmethod mi/perms-objects-set :model/Table
  [{db-id :db_id, schema :schema, table-id :id, :as table} read-or-write]
  ;; To read (e.g., fetch metadata) a Table you must have either self-service data permissions for the Table, or write
  ;; permissions for the Table (detailed below). `can-read?` checks the former, while `can-write?` checks the latter;
  ;; the permission-checking function to call when reading a Table depends on the context of the request. When reading
  ;; Tables to power the admin data model page; `can-write?` should be called; in other contexts, `can-read?` should
  ;; be called. (TODO: is there a way to clear up the semantics here?)
  ;;
  ;; To write a Table (e.g. update its metadata):
  ;;   * If Enterprise Edition code is available and the :advanced-permissions feature is enabled, you must have
  ;;     data-model permissions for othe table
  ;;   * Else, you must be an admin
  #{(case read-or-write
      :read  (perms/table-read-path table)
      :write (perms/data-model-write-perms-path db-id schema table-id))})

(defmethod serdes/hash-fields :model/Table
  [_table]
  [:schema :name (serdes/hydrated-hash :db)])


;;; ------------------------------------------------ Field ordering -------------------------------------------------

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(defn update-field-positions!
  "Update `:position` of field belonging to table `table` accordingly to `:field_order`"
  [table]
  (doall
   (map-indexed (fn [new-position field]
                  (t2/update! Field (u/the-id field) {:position new-position}))
                ;; Can't use `select-field` as that returns a set while we need an ordered list
                (t2/select [Field :id]
                           :table_id  (u/the-id table)
                           {:order-by (case (:field_order table)
                                        :custom       [[:custom_position :asc]]
                                        :smart        [[[:case
                                                         (mdb.u/isa :semantic_type :type/PK)       0
                                                         (mdb.u/isa :semantic_type :type/Name)     1
                                                         (mdb.u/isa :semantic_type :type/Temporal) 2
                                                         :else                                     3]
                                                        :asc]
                                                       [:%lower.name :asc]]
                                        :database     [[:database_position :asc]]
                                        :alphabetical [[:%lower.name :asc]])}))))

(defn- valid-field-order?
  "Field ordering is valid if all the fields from a given table are present and only from that table."
  [table field-ordering]
  (= (t2/select-pks-set Field
       :table_id (u/the-id table)
       :active   true)
     (set field-ordering)))

(defn custom-order-fields!
  "Set field order to `field-order`."
  [table field-order]
  {:pre [(valid-field-order? table field-order)]}
  (t2/update! Table (u/the-id table) {:field_order :custom})
  (doall
    (map-indexed (fn [position field-id]
                   (t2/update! Field field-id {:position        position
                                               :custom_position position}))
                 field-order)))


;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-simple-hydration-method ^{:arglists '([table])} field-values
  :field_values
  "Return the FieldValues for all Fields belonging to a single `table`."
  [{:keys [id]}]
  (let [field-ids (t2/select-pks-set Field
                    :table_id        id
                    :visibility_type "normal"
                    {:order-by field-order-rule})]
    (when (seq field-ids)
      (t2/select-fn->fn :field_id :values FieldValues, :field_id [:in field-ids]))))

(mi/define-simple-hydration-method ^{:arglists '([table])} pk-field-id
  :pk_field
  "Return the ID of the primary key `Field` for `table`."
  [{:keys [id]}]
  (t2/select-one-pk Field
    :table_id        id
    :semantic_type   (mdb.u/isa :type/PK)
    :visibility_type [:not-in ["sensitive" "retired"]]))

(defn- with-objects [hydration-key fetch-objects-fn tables]
  (let [table-ids         (set (map :id tables))
        table-id->objects (group-by :table_id (when (seq table-ids)
                                                (fetch-objects-fn table-ids)))]
    (for [table tables]
      (assoc table hydration-key (get table-id->objects (:id table) [])))))

(mi/define-batched-hydration-method with-segments
  :segments
  "Efficiently hydrate the Segments for a collection of `tables`."
  [tables]
  (with-objects :segments
    (fn [table-ids]
      (t2/select :model/Segment :table_id [:in table-ids], :archived false, {:order-by [[:name :asc]]}))
    tables))

(mi/define-batched-hydration-method with-metrics
  :metrics
  "Efficiently hydrate the Metrics for a collection of `tables`."
  [tables]
  (with-objects :metrics
    (fn [table-ids]
      (t2/select :model/LegacyMetric :table_id [:in table-ids], :archived false, {:order-by [[:name :asc]]}))
    tables))

(defn with-fields
  "Efficiently hydrate the Fields for a collection of `tables`."
  [tables]
  (with-objects :fields
    (fn [table-ids]
      (t2/select Field
        :active          true
        :table_id        [:in table-ids]
        :visibility_type [:not= "retired"]
        {:order-by       field-order-rule}))
    tables))

(mi/define-batched-hydration-method fields
  :fields
  "Efficiently hydrate the Fields for a collection of `tables`"
  [tables]
  (with-fields tables))

;;; ------------------------------------------------ Convenience Fns -------------------------------------------------

(defn database
  "Return the `Database` associated with this `Table`."
  [table]
  (t2/select-one Database :id (:db_id table)))

(def ^{:arglists '([table-id])} table-id->database-id
  "Retrieve the `Database` ID for the given table-id."
  (mdb.connection/memoize-for-application-db
   (fn [table-id]
     {:pre [(integer? table-id)]}
     (t2/select-one-fn :db_id Table, :id table-id))))

;;; ------------------------------------------------- Serialization -------------------------------------------------
(defmethod serdes/dependencies "Table" [table]
  [[{:model "Database" :id (:db_id table)}]])

(defmethod serdes/generate-path "Table" [_ table]
  (let [db-name (t2/select-one-fn :name 'Database :id (:db_id table))]
    (filterv some? [{:model "Database" :id db-name}
                    (when (:schema table)
                      {:model "Schema" :id (:schema table)})
                    {:model "Table" :id (:name table)}])))

(defmethod serdes/entity-id "Table" [_ {:keys [name]}]
  name)

(defmethod serdes/load-find-local "Table"
  [path]
  (let [db-name     (-> path first :id)
        schema-name (when (= 3 (count path))
                      (-> path second :id))
        table-name  (-> path last :id)
        db-id       (t2/select-one-pk Database :name db-name)]
    (t2/select-one Table :name table-name :db_id db-id :schema schema-name)))

(defmethod serdes/extract-one "Table"
  [_model-name _opts {:keys [db_id] :as table}]
  (-> (serdes/extract-one-basics "Table" table)
      (assoc :db_id (t2/select-one-fn :name 'Database :id db_id))))

(defmethod serdes/load-xform "Table"
  [{:keys [db_id] :as table}]
  (-> (serdes/load-xform-basics table)
      (assoc :db_id (t2/select-one-fn :id 'Database :name db_id))))

(defmethod serdes/storage-path "Table" [table _ctx]
  (concat (serdes/storage-table-path-prefix (serdes/path table))
          [(:name table)]))

;;; -------------------------------------------------- Audit Log Table -------------------------------------------------

(defmethod audit-log/model-details Table
  [table _event-type]
  (select-keys table [:id :name :db_id]))
