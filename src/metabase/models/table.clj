(ns metabase.models.table
  (:require [metabase.api.common :refer [*current-user-permissions-set*]]
            [metabase.db :as db]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [humanization :as humanization]
                             [interface :as i]
                             [metric :refer [Metric retrieve-metrics]]
                             [permissions :refer [Permissions], :as perms]
                             [segment :refer [Segment retrieve-segments]])
            [metabase.util :as u]))


;;; ------------------------------------------------------------ Constants + Entity ------------------------------------------------------------

(def ^:const entity-types
  "Valid values for `Table.entity_type` (field may also be `nil`)."
  #{:person :event :photo :place})

(def ^:const visibility-types
  "Valid values for `Table.visibility_type` (field may also be `nil`)."
  #{:hidden :technical :cruft})


(i/defentity Table :metabase_table)


;;; ------------------------------------------------------------ Lifecycle ------------------------------------------------------------

(defn- pre-insert [table]
  (let [defaults {:display_name (humanization/name->human-readable-name (:name table))}]
    (merge defaults table)))

(defn- pre-cascade-delete [{:keys [db_id schema id]}]
  (db/cascade-delete! Segment     :table_id id)
  (db/cascade-delete! Metric      :table_id id)
  (db/cascade-delete! Field       :table_id id)
  (db/cascade-delete! 'Card       :table_id id)
  (db/cascade-delete! Permissions :object [:like (str (perms/object-path db_id schema id) "%")]))

(defn- perms-objects-set [table _]
  #{(perms/object-path (:db_id table) (:schema table) (:id table))})

(u/strict-extend (class Table)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:table])
                    :types              (constantly {:entity_type :keyword, :visibility_type :keyword, :description :clob})
                    :timestamped?       (constantly true)
                    :can-read?          (partial i/current-user-has-full-permissions? :read)
                    :can-write?         i/superuser?
                    :pre-insert         pre-insert
                    :pre-cascade-delete pre-cascade-delete
                    :perms-objects-set  perms-objects-set}))


;;; ------------------------------------------------------------ Hydration ------------------------------------------------------------

(defn fields
  "Return the `FIELDS` belonging to a single TABLE."
  [{:keys [id]}]
  (db/select Field, :table_id id :visibility_type [:not= "retired"], {:order-by [[:position :asc] [:name :asc]]}))

(defn metrics
  "Retrieve the `Metrics` for a single TABLE."
  [{:keys [id]}]
  (retrieve-metrics id :all))

(defn segments
  "Retrieve the `Segments` for a single TABLE."
  [{:keys [id]}]
  (retrieve-segments id :all))

(defn field-values
  "Return the `FieldValues` for all `Fields` belonging to a single TABLE."
  {:hydrate :field_values, :arglists '([table])}
  [{:keys [id]}]
  (let [field-ids (db/select-ids Field
                    :table_id        id
                    :visibility_type "normal"
                    {:order-by [[:position :asc] [:name :asc]]})]
    (when (seq field-ids)
      (db/select-field->field :field_id :values FieldValues, :field_id [:in field-ids]))))

(defn pk-field-id
  "Return the ID of the primary key `Field` for TABLE."
  {:hydrate :pk_field, :arglists '([table])}
  [{:keys [id]}]
  (db/select-one-id Field, :table_id id, :special_type (db/isa :type/PK), :visibility_type [:not-in ["sensitive" "retired"]]))


(defn- with-objects [hydration-key fetch-objects-fn tables]
  (let [table-ids         (set (map :id tables))
        table-id->objects (group-by :table_id (when (seq table-ids)
                                                (fetch-objects-fn table-ids)))]
    (for [table tables]
      (assoc table hydration-key (get table-id->objects (:id table) [])))))

(defn with-segments
  "Efficiently hydrate the `Segments` for a collection of TABLES."
  {:batched-hydrate :segments}
  [tables]
  (with-objects :segments
    (fn [table-ids]
      (db/select Segment :table_id [:in table-ids], {:order-by [[:name :asc]]}))
    tables))

(defn with-metrics
  "Efficiently hydrate the `Metrics` for a collection of TABLES."
  {:batched-hydrate :metrics}
  [tables]
  (with-objects :metrics
    (fn [table-ids]
      (db/select Metric :table_id [:in table-ids], {:order-by [[:name :asc]]}))
    tables))

(defn with-fields
  "Efficiently hydrate the `Fields` for a collection of TABLES."
  {:batched-hydrate :fields}
  [tables]
  (with-objects :fields
    (fn [table-ids]
      (db/select Field :table_id [:in table-ids], :visibility_type [:not= "retired"], {:order-by [[:position :asc] [:name :asc]]}))
    tables))


;;; ------------------------------------------------------------ Convenience Fns ------------------------------------------------------------

(defn qualified-identifier
  "Return a keyword identifier for TABLE in the form `:schema.table-name` (if the Table has a non-empty `:schema` field) or `:table-name` (if the Table has no `:schema`)."
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


;;; ------------------------------------------------------------ Persistence Functions ------------------------------------------------------------



(defn retire-tables!
  "Retire all `Tables` in the list of TABLE-IDs along with all of each tables `Fields`."
  [table-ids]
  {:pre [(set? table-ids) (every? integer? table-ids)]}
  (when (seq table-ids)
    ;; retire the tables
    (db/update-where! Table {:id [:in table-ids]}
      :active false)
    ;; retire the fields of retired tables
    (db/update-where! Field {:table_id [:in table-ids]}
      :visibility_type "retired")))

;; TODO - rename to `update-table-from-tabledef!`
(defn update-table!
  "Update `Table` with the data from TABLE-DEF."
  [{:keys [id display_name], :as existing-table} {table-name :name}]
  {:pre [(integer? id)]}
  (let [updated-table (assoc existing-table
                        :display_name (or display_name (humanization/name->human-readable-name table-name)))]
    ;; the only thing we need to update on a table is the :display_name, if it never got set
    (when (nil? display_name)
      (db/update! Table id
        :display_name (:display_name updated-table)))
    ;; always return the table when we are done
    updated-table))

;; TODO - rename to `create-table-from-tabledef!`
(defn create-table!
  "Create `Table` with the data from TABLE-DEF."
  [database-id {schema-name :schema, table-name :name, raw-table-id :raw-table-id, visibility-type :visibility-type}]
  (db/insert! Table
    :db_id           database-id
    :raw_table_id    raw-table-id
    :schema          schema-name
    :name            table-name
    :visibility_type visibility-type
    :display_name    (humanization/name->human-readable-name table-name)
    :active          true))
