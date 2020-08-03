(ns metabase.models.table
  (:require [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [humanization :as humanization]
             [interface :as i]
             [metric :refer [Metric retrieve-metrics]]
             [permissions :as perms :refer [Permissions]]
             [segment :refer [retrieve-segments Segment]]]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ----------------------------------------------- Constants + Entity -----------------------------------------------

(def ^:const visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`).
   (Basically any non-nil value is a reason for hiding the table.)"
  #{:hidden :technical :cruft})

(def ^:const field-orderings
  "Valid values for `Table.field_order`.
  `:database`     - use the same order as in the table definition in the DB;
  `:alphabetical` - order alphabetically by name;
  `:custom`       - the user manually set the order in the data model
  `:smart`        - Try to be smart and order like you'd usually want it: first PK, followed by `:type/Name`s, then
                    `:type/Temporal`s, and from there on in alphabetical order."
  #{:database :alphabetical :custom :smart})


(models/defmodel Table :metabase_table)


;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn- pre-insert [table]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name table))
                  :field_order  (driver/default-field-order (-> table :db_id Database :engine))}]
    (merge defaults table)))

(defn- pre-delete [{:keys [db_id schema id]}]
  (db/delete! Permissions :object [:like (str (perms/object-path db_id schema id) "%")]))

(defn- perms-objects-set [table read-or-write]
  ;; To read (e.g., fetch metadata) a Table you (predictably) have read permissions; to write a Table (e.g. update its
  ;; metadata) you must have *full* permissions.
  #{(case read-or-write
      :read  (perms/table-read-path table)
      :write (perms/object-path (:db_id table) (:schema table) (:id table)))})

(u/strict-extend (class Table)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:table])
          :types          (constantly {:entity_type     :keyword
                                       :visibility_type :keyword
                                       :field_order     :keyword})
          :properties     (constantly {:timestamped? true})
          :pre-insert     pre-insert
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        i/superuser?
          :perms-objects-set perms-objects-set}))


;;; ------------------------------------------------ Field ordering -------------------------------------------------

(defn field-order-rule
  "How should we order fields."
  [_]
  [[:position :asc] [:%lower.name :asc]])

(defn update-field-positions!
  "Update `:position` of field belonging to table `table` accordingly to `:field_order`"
  [table]
  (doall
   (map-indexed (fn [new-position field]
                  (db/update! Field (u/get-id field) :position new-position))
                ;; Can't use `select-field` as that returns a set while we need an ordered list
                (db/select [Field :id]
                  :table_id  (u/get-id table)
                  {:order-by (case (:field_order table)
                               :custom       [[:custom_position :asc]]
                               :smart        [[(hsql/call :case
                                                 (mdb/isa :special_type :type/PK)       0
                                                 (mdb/isa :special_type :type/Name)     1
                                                 (mdb/isa :special_type :type/Temporal) 2
                                                 :else                                  3)
                                               :asc]
                                              [:%lower.name :asc]]
                               :database     [[:database_position :asc]]
                               :alphabetical [[:%lower.name :asc]])}))))

(defn- valid-field-order?
  "Field ordering is valid if all the fields from a given table are present and only from that table."
  [table field-ordering]
  (= (db/select-ids Field :table_id (u/get-id table)) (set field-ordering)))

(defn custom-order-fields!
  "Set field order to `field-order`."
  [table field-order]
  {:pre [(valid-field-order? table field-order)]}
  (db/update! Table (u/get-id table) :field_order :custom)
  (doall
   (map-indexed (fn [position field-id]
                  (db/update! Field field-id {:position        position
                                              :custom_position position}))
                field-order)))


;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn ^:hydrate fields
  "Return the Fields belonging to a single `table`."
  [{:keys [id] :as table}]
  (db/select Field
    :table_id        id
    :active          true
    :visibility_type [:not= "retired"]
    {:order-by (field-order-rule table)}))

(defn metrics
  "Retrieve the Metrics for a single `table`."
  [{:keys [id]}]
  (retrieve-metrics id :all))

(defn segments
  "Retrieve the Segments for a single `table`."
  [{:keys [id]}]
  (retrieve-segments id :all))

(defn field-values
  "Return the FieldValues for all Fields belonging to a single `table`."
  {:hydrate :field_values, :arglists '([table])}
  [{:keys [id] :as table}]
  (let [field-ids (db/select-ids Field
                    :table_id        id
                    :visibility_type "normal"
                    {:order-by (field-order-rule table)})]
    (when (seq field-ids)
      (db/select-field->field :field_id :values FieldValues, :field_id [:in field-ids]))))

(defn pk-field-id
  "Return the ID of the primary key `Field` for `table`."
  {:hydrate :pk_field, :arglists '([table])}
  [{:keys [id]}]
  (db/select-one-id Field
    :table_id        id
    :special_type    (mdb/isa :type/PK)
    :visibility_type [:not-in ["sensitive" "retired"]]))


(defn- with-objects [hydration-key fetch-objects-fn tables]
  (let [table-ids         (set (map :id tables))
        table-id->objects (group-by :table_id (when (seq table-ids)
                                                (fetch-objects-fn table-ids)))]
    (for [table tables]
      (assoc table hydration-key (get table-id->objects (:id table) [])))))

(defn with-segments
  "Efficiently hydrate the Segments for a collection of `tables`."
  {:batched-hydrate :segments}
  [tables]
  (with-objects :segments
    (fn [table-ids]
      (db/select Segment :table_id [:in table-ids], :archived false, {:order-by [[:name :asc]]}))
    tables))

(defn with-metrics
  "Efficiently hydrate the Metrics for a collection of `tables`."
  {:batched-hydrate :metrics}
  [tables]
  (with-objects :metrics
    (fn [table-ids]
      (db/select Metric :table_id [:in table-ids], :archived false, {:order-by [[:name :asc]]}))
    tables))

(defn with-fields
  "Efficiently hydrate the Fields for a collection of `tables`."
  [tables]
  (with-objects :fields
    (fn [table-ids]
      (db/select Field
        :active          true
        :table_id        [:in table-ids]
        :visibility_type [:not= "retired"]
        {:order-by       (field-order-rule tables)}))
    tables))


;;; ------------------------------------------------ Convenience Fns -------------------------------------------------

(defn qualified-identifier
  "Return a keyword identifier for `table` in the form `:schema.table-name` (if the Table has a non-empty `:schema` field)
  or `:table-name` (if the Table has no `:schema`)."
  ^clojure.lang.Keyword [{schema :schema, table-name :name}]
  (keyword (str (when (seq schema)
                  (str schema \.))
                table-name)))

(defn database
  "Return the `Database` associated with this `Table`."
  [table]
  (Database (:db_id table)))

(defn table-id->database-id
  "Retrieve the `Database` ID for the given table-id."
  [table-id]
  {:pre [(integer? table-id)]}
  (db/select-one-field :db_id Table, :id table-id))
