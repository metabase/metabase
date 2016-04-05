(ns metabase.sync-database.sync
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.models.common :as common]
            [metabase.models.field :as field]
            [metabase.models.raw-column :as raw-column]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.util :as u]))


(def ^:private ^:dynamic *sync-dynamic* false)


(defn- save-all-fks!
  "Update all of the FK relationships present in DATABASE based on what's captured in the raw schema.
   This will set :special_type :fk and :fk_target_field_id <field-id> for each found FK relationship.
   NOTE: we currently overwrite any previously defined metadata when doing this."
  [{database-id :id}]
  (when-let [fk-sources (k/select raw-column/RawColumn
                          (k/fields :id :fk_target_column_id)
                          (k/join raw-table/RawTable (= :raw_table.id :raw_table_id))
                          (k/where {:raw_table.database_id database-id})
                          (k/where (not= :raw_column.fk_target_column_id nil)))]
    (doseq [{fk-source-id :id, fk-target-id :fk_target_column_id} fk-sources]
      ;; TODO: it's possible there are multiple fields here with the same source/target column ids
      (when-let [source-field-id (db/sel :one :field [field/Field :id] :raw_column_id fk-source-id, :visibility_type [not= "retired"])]
        (when-let [target-field-id (db/sel :one :field [field/Field :id] :raw_column_id fk-target-id, :visibility_type [not= "retired"])]
          (db/upd field/Field source-field-id
            :special_type       :fk
            :fk_target_field_id target-field-id))))))


(defn- sync-metabase-metadata-table!
  "Databases may include a table named `_metabase_metadata` (case-insentive) which includes descriptions or other metadata about the `Tables` and `Fields`
   it contains. This table is *not* synced normally, i.e. a Metabase `Table` is not created for it. Instead, *this* function is called, which reads the data it
   contains and updates the relevant Metabase objects.

   The table should have the following schema:

     column  | type    | example
     --------+---------+-------------------------------------------------
     keypath | varchar | \"products.created_at.description\"
     value   | varchar | \"The date the product was added to our catalog.\"

   `keypath` is of the form `table-name.key` or `table-name.field-name.key`, where `key` is the name of some property of `Table` or `Field`.

   This functionality is currently only used by the Sample Dataset. In order to use this functionality, drivers must implement optional fn `:table-rows-seq`."
  [driver database _metabase_metadata]
  (doseq [{:keys [keypath value]} (driver/table-rows-seq driver database _metabase_metadata)]
    (let [[_ table-name field-name k] (re-matches #"^([^.]+)\.(?:([^.]+)\.)?([^.]+)$" keypath)]
      (try (when (not= 1 (if field-name
                           (k/update field/Field
                             ;; TODO: need to handle issue where subselect could return multiple values
                             (k/where {:name field-name, :table_id (k/subselect table/Table
                                                                                (k/fields :id)
                                                                                (k/where {:db_id (:id database), :name table-name}))})
                             (k/set-fields {(keyword k) value}))
                           (k/update table/Table
                             (k/where {:name table-name, :db_id (:id database)})
                             (k/set-fields {(keyword k) value}))))
             (log/error (u/format-color "Error syncing _metabase_metadata: no matching keypath: %s" keypath)))
           (catch Throwable e
             (log/error (u/format-color 'red "Error in _metabase_metadata: %s" (.getMessage e))))))))


(def ^{:arglists '([column])} infer-field-special-type
  "If RAW-COLUMN has a `name` and `base_type` that matches a known pattern, return the `special_type` we should assign to it."
  (let [bool-or-int #{:BooleanField :BigIntegerField :IntegerField}
        float       #{:DecimalField :FloatField}
        int-or-text #{:BigIntegerField :IntegerField :CharField :TextField}
        text        #{:CharField :TextField}
        ;; tuples of [pattern set-of-valid-base-types special-type
        ;; * Convert field name to lowercase before matching against a pattern
        ;; * consider a nil set-of-valid-base-types to mean "match any base type"
        pattern+base-types+special-type [[#"^.*_lat$"       float       :latitude]
                                         [#"^.*_lon$"       float       :longitude]
                                         [#"^.*_lng$"       float       :longitude]
                                         [#"^.*_long$"      float       :longitude]
                                         [#"^.*_longitude$" float       :longitude]
                                         [#"^.*_rating$"    int-or-text :category]
                                         [#"^.*_type$"      int-or-text :category]
                                         [#"^.*_url$"       text        :url]
                                         [#"^_latitude$"    float       :latitude]
                                         [#"^active$"       bool-or-int :category]
                                         [#"^city$"         text        :city]
                                         [#"^country$"      text        :country]
                                         [#"^countryCode$"  text        :country]
                                         [#"^currency$"     int-or-text :category]
                                         [#"^first_name$"   text        :name]
                                         [#"^full_name$"    text        :name]
                                         [#"^gender$"       int-or-text :category]
                                         [#"^last_name$"    text        :name]
                                         [#"^lat$"          float       :latitude]
                                         [#"^latitude$"     float       :latitude]
                                         [#"^lon$"          float       :longitude]
                                         [#"^lng$"          float       :longitude]
                                         [#"^long$"         float       :longitude]
                                         [#"^longitude$"    float       :longitude]
                                         [#"^name$"         text        :name]
                                         [#"^postalCode$"   int-or-text :zip_code]
                                         [#"^postal_code$"  int-or-text :zip_code]
                                         [#"^rating$"       int-or-text :category]
                                         [#"^role$"         int-or-text :category]
                                         [#"^sex$"          int-or-text :category]
                                         [#"^state$"        text        :state]
                                         [#"^status$"       int-or-text :category]
                                         [#"^type$"         int-or-text :category]
                                         [#"^url$"          text        :url]
                                         [#"^zip_code$"     int-or-text :zip_code]
                                         [#"^zipcode$"      int-or-text :zip_code]]]
    ;; Check that all the pattern tuples are valid
    (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
      (assert (= (type name-pattern) java.util.regex.Pattern))
      (assert (every? (partial contains? field/base-types) base-types))
      (assert (contains? field/special-types special-type)))

    (fn [{:keys [base_type details], field-name :name, pk? :is_pk}]
      (when (and (string? field-name)
                 (keyword? base_type))
        (let [{:keys [special-type]} details]
          (or special-type
              (when pk? :id)
              (when (= "id" (s/lower-case field-name)) :id)
              (when-let [matching-pattern (m/find-first (fn [[name-pattern valid-base-types _]]
                                                          (and (or (nil? valid-base-types)
                                                                   (contains? valid-base-types base_type))
                                                               (re-matches name-pattern (s/lower-case field-name))))
                                                        pattern+base-types+special-type)]
                ;; a little something for the app log
                (log/debug (u/format-color 'green "%s '%s' matches '%s'. Setting special_type to '%s'."
                                           (name base_type) field-name (first matching-pattern) (name (last matching-pattern))))
                ;; the actual special-type is the last element of the pattern
                (last matching-pattern))))))))


(defn- update-field!
  "Update a single `Field` with values from `RawColumn`."
  [{:keys [id], :as existing-field} {column-name :name, :keys [base_type], :as column}]
  (let [special-type (or (:special_type existing-field)
                         (infer-field-special-type column))]
    ;; if we have a different base-type or special-type, then update
    (when (or (not= base_type (:base_type existing-field))
              (not= special-type (:special_type existing-field)))
      (db/upd field/Field id
        :display_name (or (:display_name existing-field)
                          (common/name->human-readable-name column-name))
        :base_type    base_type
        :special_type special-type))))


(defn- create-field!
  "Create a new `Field` with values from `RawColumn`."
  [table-id {column-name :name, column-id :id, :keys [base_type], :as column}]
  (let [fk-target-field (when-let [fk-target-column (:fk_target_column_id column)]
                          ;; we need the field-id in this database which corresponds to this raw-columns fk target
                          (db/sel :one :field [field/Field :id] :raw_column_id fk-target-column))]
    (db/ins field/Field
      :table_id           table-id
      :raw_column_id      column-id
      :name               column-name
      :display_name       (common/name->human-readable-name column-name)
      :base_type          base_type
      :special_type       (infer-field-special-type column)
      :fk_target_field_id fk-target-field)))


(defn- save-table-fields!
  "Refresh all `Fields` in a given `Table` based on what's available in the associated `RawColumns`.

   If a raw column has been disabled, the field is retired.
   If there is a new raw column, then a new field is created.
   If a raw column has been updated, then we update the values for the field."
  [{table-id :id, raw-table-id :raw_table_id}]
  (let [active-raw-columns  (raw-table/active-columns {:id raw-table-id})
        active-column-ids   (set (map :id active-raw-columns))
        existing-fields     (into {} (for [{raw-column-id :raw_column_id, :as fld} (db/sel :many field/Field, :table_id table-id, :visibility_type [not= "retired"], :parent_id nil)]
                                       {raw-column-id fld}))]
    ;; retire any fields which were disabled in the schema (including child nested fields)
    (doseq [[raw-column-id {field-id :id}] existing-fields]
      (when-not (contains? active-column-ids raw-column-id)
        (k/update field/Field
          (k/where (or {:id field-id}
                       {:parent_id field-id}))
          (k/set-fields {:visibility_type "retired"}))))

    ;; create/update the active columns
    (doseq [{raw-column-id :id, :as column} active-raw-columns]
      (if-let [existing-field (get existing-fields raw-column-id)]
        ;; field already exists, so we UPDATE it
        (update-field! existing-field column)
        ;; looks like a new field, so we CREATE it
        (create-field! table-id column)))))


(defn- save-fields!
  "Update `Fields` for `Table`.

   This is a simple delegating function which either calls sync-dynamic/save-table-fields! or sync/save-table-fields! based
   on whether the database being synced has a `:dynamic-schema`."
  [tbl]
  (if *sync-dynamic*
    ((ns-resolve 'metabase.sync-database.sync-dynamic 'save-table-fields!) tbl)
    (save-table-fields! tbl)))


(defn- update-table!
  "Update `Table` with the data from `RawTable`, including saving all fields."
  [{:keys [id display_name], :as existing-table} {table-name :name}]
  ;; the only thing we need to update on a table is the :display_name, if it never got set
  (when (nil? display_name)
    (db/upd table/Table id
      :display_name (common/name->human-readable-name table-name)))
  ;; now update the all the table fields
  (save-fields! existing-table))


(defn- create-table!
  "Create `Table` with the data from `RawTable`, including all fields."
  [database-id {schema-name :schema, table-name :name, raw-table-id :id}]
  (let [new-table  (db/ins table/Table
                     :db_id        database-id
                     :raw_table_id raw-table-id
                     :schema       schema-name
                     :name         table-name
                     :display_name (common/name->human-readable-name table-name)
                     :active       true)]
    ;; now create all the table fields
    (save-fields! new-table)))


(defn update-data-models-from-raw-tables!
  "Update the working `Table` and `Field` metadata for DATABASE based on the latest raw schema information.
   This function uses the data in `RawTable` and `RawColumn` to update the working data models as needed.

   NOTE: when a database is a `:dynamic-schema` database we follow a slightly different execution path."
  [driver {database-id :id, :as database}]
  {:pre [(integer? database-id)]}

  ;; retire tables (and their fields) as needed
  (let [tables-to-remove (set (map :id (k/select table/Table
                                         (k/fields :id)
                                         (k/join raw-table/RawTable (= :raw_table.id :raw_table_id))
                                         (k/where {:db_id database-id
                                                   :active true
                                                   :raw_table.active false}))))]
    ;; retire the tables
    (k/update table/Table
      (k/where {:id [in tables-to-remove]})
      (k/set-fields {:active false}))
    ;; retire the fields of retired tables
    (k/update field/Field
      (k/where {:table_id [in tables-to-remove]})
      (k/set-fields {:visibility_type "retired"})))

  (let [raw-tables      (raw-table/active-tables database-id)
        existing-tables (into {} (for [{raw-table-id :raw_table_id, :as table} (db/sel :many table/Table, :db_id database-id, :active true)]
                                   {raw-table-id table}))]
    ;; create/update tables (and their fields)
    ;; NOTE: we make sure to skip the _metabase_metadata table here.  it's not a normal table.
    (doseq [{raw-table-id :id, :as raw-tbl} (filter #(not= "_metabase_metadata" (s/lower-case (:name %))) raw-tables)]
      (try
        (binding [*sync-dynamic* (driver/driver-supports? driver :dynamic-schema)]
          (if-let [existing-table (get existing-tables raw-table-id)]
            ;; table already exists, update it
            (update-table! existing-table raw-tbl)
            ;; must be a new table, insert it
            (create-table! database-id raw-tbl)))
        (catch Throwable t
          (log/error (u/format-color 'red "Unexpected error syncing table") t))))

    ;; handle setting any fk relationships
    ;; NOTE: this must be done after fully syncing the tables/fields because we need all tables/fields in place
    (save-all-fks! database)

    ;; NOTE: if per chance there were multiple _metabase_metadata tables in different schemas, we just take the first
    (when-let [_metabase_metadata (first (filter #(= (s/lower-case (:name %)) "_metabase_metadata") raw-tables))]
      (sync-metabase-metadata-table! driver database _metabase_metadata))))
