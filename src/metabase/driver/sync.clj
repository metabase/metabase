(ns metabase.driver.sync
  "The logic for doing DB and Table syncing itself."
  (:require [cheshire.core :as json]
            [clojure.math.numeric-tower :as math]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [korma.core :as k]
            [medley.core :as m]
            [schema.core :as schema]
            [metabase.db :refer :all]
            [metabase.db.metadata-queries :as queries]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :as qp]
            [metabase.driver :as driver]
            [metabase.events :as events]
            (metabase.models [common :as common]
                             [field :refer [Field] :as field]
                             [field-values :as field-values]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table], :as table])
            [metabase.util :as u]))

(declare sync-database-active-tables!
         sync-database-with-tracking!
         sync-table-active-fields-and-pks!
         sync-table-fks!
         sync-table-nested-fields!)


;;; ## ---------------------------------------- PUBLIC API ----------------------------------------


(def ^:private ^:const percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be marked as `special_type = :url`."
  0.95)


(def ^:private ^:const low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)


(def ^:private ^:const average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)


(defn sync-database!
  "Sync DATABASE and all its Tables and Fields.

   Takes an optional kwarg `:full-sync?` which determines if we execute our table analysis work.  If this is not specified
   then we default to using the `:is_full_sync` attribute of the database."
  [driver database & {:keys [full-sync?]}]
  (binding [qp/*disable-qp-logging* true
            *sel-disable-logging*   true]
    (let [full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context driver database (partial sync-database-with-tracking! driver database full-sync?)))))

(defn sync-table!
  "Sync a *single* TABLE and all of its Fields.
   This is used *instead* of `sync-database!` when syncing just one Table is desirable.

   Takes an optional kwarg `:full-sync?` which determines if we execute our table analysis work.  If this is not specified
   then we default to using the `:is_full_sync` attribute of the tables parent database."
  [driver table & {:keys [full-sync?]}]
  (binding [qp/*disable-qp-logging* true]
    (let [database   (table/database table)
          full-sync? (if-not (nil? full-sync?)
                       full-sync?
                       (:is_full_sync database))]
      (driver/sync-in-context driver database (fn []
                                                (sync-database-active-tables! driver [table] :analyze? full-sync?)
                                                (events/publish-event :table-sync {:table_id (:id table)}))))))


;;; ## ---------------------------------------- IMPLEMENTATION ----------------------------------------


(defn- save-database-tables-list!
  "Create new Fields (and mark old ones as inactive) for TABLE, and update PK fields."
  [database table-defs]
  (let [active-tables             (set (->> (for [table-def table-defs]
                                              (-> (select-keys table-def [:name :schema])
                                                  (update :schema identity)))                                 ; make sure :schema is defined on every table
                                            (filter #(not= "_metabase_metadata" (s/lower-case (:name %))))))  ; exclude _metabase_metadata table which is not a real table
        existing-table-def->table (into {} (for [{:keys [name schema] :as table} (sel :many :fields [Table :name :schema :id :display_name], :db_id (:id database), :active true)]
                                              {{:name name, :schema schema} table}))]
    ;; first mark inactive Tables
    (doseq [[table-def {:keys [id]}] existing-table-def->table]
      (when-not (contains? active-tables table-def)
        (upd Table id :active false)
        (log/info (u/format-color 'cyan "Marked table %s.%s%s as inactive." (:name database) (if (:schema table-def) (str (:schema table-def) \.) "") (:name table-def)))

        ;; We need to mark the Table's Fields as inactive as well
        (k/update Field
                  (k/where {:table_id id})
                  (k/set-fields {:active false}))))

    ;; a little logging so we are better informed
    (let [new-tables (set/difference active-tables (set (keys existing-table-def->table)))]
      (when (seq new-tables)
        (log/debug (u/format-color 'blue "Found new tables: %s" (vec (for [{table :name, schema :schema} new-tables]
                                                                       (if schema (str schema \. table)
                                                                                  table)))))))

    ;; Create new Tables, update existing ones if needed
    (doseq [table-def (sort-by :name active-tables)]
      (let [existing-table (existing-table-def->table table-def)
            display-name   (common/name->human-readable-name (:name table-def))]
        (if-not existing-table
          ;; Table doesn't exist, so create it.
          (ins Table
            :db_id        (:id database)
            :schema       (:schema table-def)
            :name         (:name table-def)
            :display_name display-name
            :active       true)
          ;; Otherwise update the Table if needed
          (when (nil? (:display_name existing-table))
            (upd Field (:id existing-table)
              :display_name display-name)))))))


(def ^:private sync-progress-meter-string
  "Create a string that shows sync progress for a database.

     (sync-progress-meter-string 10 40)
       -> \"[************······································] 25%\""
  (let [^:const meter-width    50
        ^:const progress-emoji ["😱"  ; face screaming in fear
                                "😢"  ; crying face
                                "😞"  ; disappointed face
                                "😒"  ; unamused face
                                "😕"  ; confused face
                                "😐"  ; neutral face
                                "😬"  ; grimacing face
                                "😌"  ; relieved face
                                "😏"  ; smirking face
                                "😋"  ; face savouring delicious food
                                "😊"  ; smiling face with smiling eyes
                                "😍"  ; smiling face with heart shaped eyes
                                "😎"] ; smiling face with sunglasses
        percent-done->emoji    (fn [percent-done]
                                 (progress-emoji (int (math/round (* percent-done (dec (count progress-emoji)))))))]
    (fn [tables-finished total-tables]
      (let [percent-done (float (/ tables-finished total-tables))
            filleds      (int (* percent-done meter-width))
            blanks       (- meter-width filleds)]
        (str "["
             (apply str (repeat filleds "*"))
             (apply str (repeat blanks "·"))
             (format "] %s  %3.0f%%" (percent-done->emoji percent-done) (* percent-done 100.0)))))))


(defn- sync-database-active-table!
  "Sync the given table, optionally skipping the more time & resource intensive part of the process by specifying `:analyze? false`."
  [driver table & {:keys [analyze?]
                   :or {analyze? true}}]
  (let [active-field-ids         #(set (sel :many :field [Field :id], :table_id (:id table), :active true, :parent_id nil))
        table-def                (driver/describe-table driver table)
        current-active-field-ids (active-field-ids)]
    (schema/validate driver/DescribeTable table-def)

    ;; Run basic schema syncing to create all the Fields / PKs
    (u/try-apply sync-table-active-fields-and-pks! table table-def)

    ;; If this driver supports nested fields then lets sync those now as well
    (when (contains? (driver/features driver) :nested-fields)
      (u/try-apply sync-table-nested-fields! table table-def))

    ;; If we are doing a FULL sync then call functions which require querying the table
    (when analyze?
      (let [new-field-ids (set/difference (active-field-ids) current-active-field-ids)]
        (when-let [table-stats (driver/analyze-table driver table new-field-ids)]
          (schema/validate driver/AnalyzeTable table-stats)

          ;; update table row count
          (when (:row_count table-stats)
            (upd Table (:id table) :rows (:row_count table-stats)))

          ;; update individual fields
          (doseq [{:keys [id preview-display special-type values]} (:fields table-stats)]
            ;; set Field metadata we may have detected
            (when (and id (or preview-display special-type))
              (upd-non-nil-keys Field id
                :preview_display preview-display
                :special_type    special-type))
            ;; handle field values, setting them if applicable otherwise clearing them
            (if (and id values (< 0 (count (filter identity values))))
              (field-values/save-field-values id values)
              (field-values/clear-field-values id))))))))


(defn- sync-database-active-tables!
  "Perform sync operations for the given list of tables.  We do 2 passes over the listed tables, the first which does
   the bulk of the work and establishes fields & metadata, and a second pass to fill in foreign keys if supported."
  [driver active-tables & {:keys [analyze?]
                           :or {analyze? true}}]
  ;; Do a first pass which does the bulk of the work
  (let [tables-count          (count active-tables)
        finished-tables-count (atom 0)]
    (doseq [table active-tables]
      (sync-database-active-table! driver table :analyze? analyze?)

      (swap! finished-tables-count inc)
      (log/debug (u/format-color 'magenta "%s Synced table '%s'." (sync-progress-meter-string @finished-tables-count tables-count) (:name table)))))

  ;; Second pass to sync FKs, which must take place after all other table info is in place
  (when (contains? (driver/features driver) :foreign-keys)
    (doseq [table active-tables]
      (u/try-apply sync-table-fks! driver table))))


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
                           (k/update Field
                                     (k/where {:name field-name, :table_id (k/subselect Table
                                                                                        (k/fields :id)
                                                                                        (k/where {:db_id (:id database), :name table-name}))})
                                     (k/set-fields {(keyword k) value}))
                           (k/update Table
                                     (k/where {:name table-name, :db_id (:id database)})
                                     (k/set-fields {(keyword k) value}))))
             (log/error (u/format-color "Error syncing _metabase_metadata: no matching keypath: %s" keypath)))
           (catch Throwable e
             (log/error (u/format-color 'red "Error in _metabase_metadata: %s" (.getMessage e))))))))


(defn- sync-database-with-tracking! [driver database full-sync?]
  (let [start-time (System/nanoTime)
        tracking-hash (str (java.util.UUID/randomUUID))]
    (log/info (u/format-color 'magenta "Syncing %s database '%s'..." (name driver) (:name database)))
    (events/publish-event :database-sync-begin {:database_id (:id database) :custom_id tracking-hash})

    (let [database-schema (driver/describe-database driver database)]
      (schema/validate driver/DescribeDatabase database-schema)

      ;; now persist the list of tables, creating new ones as needed and inactivating old ones
      (save-database-tables-list! database (:tables database-schema))

      ;; once the tables are persisted then we can do a detailed sync for each table
      (let [tables (for [table (sel :many Table, :db_id (:id database), :active true (k/order :name :ASC))]
                     ;; replace default delays with ones that reuse database (and don't require a DB call)
                     (assoc table :db (delay database)))]
        (sync-database-active-tables! driver tables :analyze? full-sync?))

      ;; lastly, if we have a _metabase_metadata table go ahead and handle it
      (when-let [_metabase_metadata (first (filter #(= (s/lower-case (:name %)) "_metabase_metadata") (:tables database-schema)))]
        (sync-metabase-metadata-table! driver database _metabase_metadata)))

    (events/publish-event :database-sync-end {:database_id (:id database) :custom_id tracking-hash :running_time (int (/ (- (System/nanoTime) start-time)
                                                                                                                         1000000.0))}) ; convert to ms
    (log/info (u/format-color 'magenta "Finished syncing %s database '%s'. (%s)" (name driver) (:name database)
                              (u/format-nanoseconds (- (System/nanoTime) start-time))))))


;; ## Describe Table

(def ^{:arglists '([field-def])}
infer-field-special-type
  "If FIELD has a `name` and `base_type` that matches a known pattern, return the `special_type` we should assign to it."
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

    (fn [{:keys [base-type special-type pk?] field-name :name}]
      {:pre [(string? field-name)
             (keyword? base-type)]}
      (or special-type
          (when pk? :id)
          (when (= "id" (s/lower-case field-name)) :id)
          (when-let [matching-pattern (m/find-first (fn [[name-pattern valid-base-types _]]
                                                      (and (or (nil? valid-base-types)
                                                               (contains? valid-base-types base-type))
                                                           (re-matches name-pattern (s/lower-case field-name))))
                                                    pattern+base-types+special-type)]
            ;; a little something for the app log
            (log/debug (u/format-color 'green "%s '%s' matches '%s'. Setting special_type to '%s'."
                                       (name base-type) field-name (first matching-pattern) (name (last matching-pattern))))
            ;; the actual special-type is the last element of the pattern
            (last matching-pattern))))))

(defn- insert-or-update-active-field!
  [field-def existing-field table-id]
  (let [{field-name :name, field-base-type :base-type}  field-def
        {existing-base-type    :base_type
         existing-special-type :special_type
         existing-display-name :display_name}           existing-field
        field-special-type                              (or existing-special-type
                                                            (infer-field-special-type field-def))
        field-display-name                              (or existing-display-name
                                                            (common/name->human-readable-name field-name))
        field-base-type                                 (if (= field-base-type existing-base-type)
                                                          existing-base-type
                                                          field-base-type)]
    (if-not existing-field
      ;; Field doesn't exist, so create it.
      (ins Field
        :table_id     table-id
        :parent_id    (:parent_id field-def)
        :name         field-name
        :display_name field-display-name
        :base_type    field-base-type
        :special_type field-special-type)
      ;; Otherwise update the Field if needed
      (when-not (and (= field-display-name existing-display-name)
                     (= field-base-type existing-base-type)
                     (= field-special-type existing-special-type))
        (log/debug (u/format-color 'blue "Updating field '%s' :base_type %s, :special_type %s, :display_name." field-name field-base-type field-special-type field-display-name))
        (upd Field (:id existing-field)
          :display_name field-display-name
          :base_type    field-base-type
          :special_type field-special-type)))))

(defn- sync-table-active-fields-and-pks!
  "Create new Fields (and mark old ones as inactive) for TABLE, and update PK fields."
  [table table-def]

  (let [existing-field-name->field (sel :many :field->fields [Field :name :base_type :special_type :display_name :id], :table_id (:id table), :active true, :parent_id nil)]
    ;; As above, first mark inactive Fields
    (let [active-column-names (set (map :name (:fields table-def)))]
      (doseq [[field-name {field-id :id}] existing-field-name->field]
        (when-not (contains? active-column-names field-name)
          (upd Field field-id :active false)
          ;; We need to inactivate any nested fields as well
          (k/update Field
                    (k/where {:parent_id field-id})
                    (k/set-fields {:active false}))
          (log/info (u/format-color 'cyan "Marked field '%s.%s' as inactive." (:name table) field-name)))))

    ;; Create new Fields, update existing types if needed
    (let [existing-field-names (set (keys existing-field-name->field))
          new-field-names      (set/difference (set (map :name (:fields table-def))) existing-field-names)]
      (when (seq new-field-names)
        (log/debug (u/format-color 'blue "Found new fields for table '%s': %s" (:name table) new-field-names)))

      (doseq [field-def (sort-by :name (:fields table-def))]
        (insert-or-update-active-field! (assoc field-def :parent_id nil) (existing-field-name->field (:name field-def)) (:id table))))))


(defn- sync-field-nested-fields! [parent-field nested-field-defs table-id]
  (let [existing-field-name->field (sel :many :field->fields [Field :name :base_type :special_type :display_name :id], :active true, :parent_id (:id parent-field))]
    ;; NOTE: this is intentionally disabled because we don't want to remove valid nested fields simply because we scanned different data this time :/
    ;; As above, first mark inactive Fields
    ;(let [active-column-names (set (map :name nested-field-defs))]
    ;  (doseq [[field-name {field-id :id}] existing-field-name->field]
    ;    (when-not (contains? active-column-names field-name)
    ;      (upd Field field-id :active false)
    ;      ;; We need to inactivate any nested fields as well
    ;      (k/update Field
    ;                (k/where {:parent_id field-id})
    ;                (k/set-fields {:active false}))
    ;      (log/info (u/format-color 'cyan "Marked nested field '%s.%s' as inactive." (:name parent-field) field-name)))))

    ;; Create new Fields, update existing types if needed
    (let [existing-field-names (set (keys existing-field-name->field))
          new-field-names      (set/difference (set (map :name nested-field-defs)) existing-field-names)]
      (when (seq new-field-names)
        (log/debug (u/format-color 'blue "Found new nested fields for field '%s': %s" (:name parent-field) new-field-names)))

      (doseq [nested-field-def nested-field-defs]
        (let [nested-field-def (assoc nested-field-def :parent_id (:id parent-field))
              existing-field   (existing-field-name->field (:name nested-field-def))]
          (insert-or-update-active-field! nested-field-def existing-field table-id)
          (when (:nested-fields nested-field-def)
            ;; TODO: we can recur here and sync the next level of nesting if we want
            (let [new-parent-field (sel :one Field :name (:name nested-field-def) :table_id table-id, :active true, :parent_id (:id parent-field))]
              (sync-field-nested-fields! new-parent-field (:nested-fields nested-field-def) table-id))))))))


(defn- sync-table-nested-fields! [{table-id :id :as table} table-def]

  (doseq [field-def (:fields table-def)]
    (when (:nested-fields field-def)
      (let [parent-field (sel :one Field :name (:name field-def) :table_id table-id, :active true, :parent_id nil)]
        (sync-field-nested-fields! parent-field (:nested-fields field-def) table-id))))

  (let [existing-field-name->field (sel :many :field->fields [Field :name :base_type :special_type :display_name :id], :table_id table-id, :active true, :parent_id nil)]
    ;; As above, first mark inactive Fields
    (let [active-column-names (set (map :name (:fields table-def)))]
      (doseq [[field-name {field-id :id}] existing-field-name->field]
        (when-not (contains? active-column-names field-name)
          (upd Field field-id :active false)
          ;; We need to inactivate any nested fields as well
          (k/update Field
                    (k/where {:parent_id field-id})
                    (k/set-fields {:active false}))
          (log/info (u/format-color 'cyan "Marked field '%s.%s' as inactive." (:name table) field-name)))))

    ;; Create new Fields, update existing types if needed
    (let [existing-field-names (set (keys existing-field-name->field))
          new-field-names      (set/difference (set (map :name (:fields table-def))) existing-field-names)]
      (when (seq new-field-names)
        (log/debug (u/format-color 'blue "Found new fields for table '%s': %s" (:name table) new-field-names)))

      (doseq [field-def (:fields table-def)]
        (insert-or-update-active-field! field-def (existing-field-name->field (:name field-def)) table)))))


(defn- sync-table-fks! [driver table]
  (when (contains? (driver/features driver) :foreign-keys)
    (let [fks (driver/describe-table-fks driver table)]
      (schema/validate driver/DescribeTableFKs fks)
      (when (seq fks)
        (let [fk-name->id (sel :many :field->id [Field :name], :table_id (:id table), :name [in (map :fk-column-name fks)], :parent_id nil)]
          (doseq [{:keys [fk-column-name dest-column-name dest-table]} fks]
            (when-let [fk-column-id (fk-name->id fk-column-name)]
              (when-let [dest-table-id (sel :one :field [Table :id], :db_id (:db_id table) :name (:name dest-table) :schema (:schema dest-table))]
                (when-let [dest-column-id (sel :one :id Field, :table_id dest-table-id, :name dest-column-name, :parent_id nil)]
                  (log/debug (u/format-color 'green "Marking foreign key '%s.%s' -> '%s.%s'." (:name table) fk-column-name (:name dest-table) dest-column-name))
                  (when-not (exists? ForeignKey :origin_id fk-column-id, :destination_id dest-column-id)
                    (ins ForeignKey
                      :origin_id      fk-column-id
                      :destination_id dest-column-id
                      ;; TODO: do we even care about this?
                      ;:relationship  (determine-fk-type {:id fk-column-id, :table (delay table)}) ; fake a Field instance
                      :relationship   :Mt1))
                  (upd Field fk-column-id :special_type :fk))))))))))


;; ## Analyze Table

(defn table-row-count
  "Determine the count of rows in TABLE by running a simple structured MBQL query."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (queries/table-row-count table)
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to determine row_count for '%s': %s" (:name table) (.getMessage e))))))

(defn test-for-cardinality?
  "Should FIELD should be tested for cardinality?"
  [field is-new?]
  (let [not-field-values-elligible #{:ArrayField
                                     :DateField
                                     :DateTimeField
                                     :DictionaryField
                                     :TimeField
                                     :UnknownField}]
    (or (field-values/field-should-have-field-values? field)
        (and (nil? (:special_type field))
             is-new?
             (not (contains? not-field-values-elligible (:base_type field)))))))

(defn test:cardinality-and-extract-field-values
  "Extract field-values for FIELD.  If number of values exceeds `low-cardinality-threshold` then we return an empty set of values."
  [field field-stats]
  ;; TODO: we need some way of marking a field as not allowing field-values so that we can skip this work if it's not appropriate
  ;;       for example, :category fields with more than MAX values don't need to be rescanned all the time
  (let [non-nil-values  (filter identity (queries/field-distinct-values field (inc low-cardinality-threshold)))
        ;; only return the list if we didn't exceed our MAX values
        distinct-values (when-not (< low-cardinality-threshold (count non-nil-values))
                          non-nil-values)]
    ;; TODO: eventually we can check for :nullable? based on the original values above
    (cond-> (assoc field-stats :values distinct-values)
      (and (nil? (:special_type field))
           (< 0 (count distinct-values))) (assoc :special-type :category))))

(defn- test:no-preview-display
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [driver field field-stats]
  (if-not (and (:preview_display field)
               (contains? #{:CharField :TextField} (:base_type field)))
    ;; this field isn't suited for this test
    field-stats
    ;; test for avg length
    (let [avg-len (u/try-apply (:field-avg-length driver) field)]
      (if-not (and avg-len (> avg-len average-length-no-preview-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' has an average length of %d. Not displaying it in previews." (field/qualified-name field) avg-len))
          (assoc field-stats :preview-display false))))))

(defn- test:url-special-type
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `url`."
  [driver field field-stats]
  (if-not (and (not (:special_type field))
               (contains? #{:CharField :TextField} (:base_type field)))
    ;; this field isn't suited for this test
    field-stats
    ;; test for url values
    (let [percent-urls (u/try-apply (:field-percent-urls driver) field)]
      (if-not (and (float? percent-urls)
                   (>= percent-urls 0.0)
                   (<= percent-urls 100.0)
                   (> percent-urls percent-valid-url-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' is %d%% URLs. Marking it as a URL." (field/qualified-name field) (int (math/round (* 100 percent-urls)))))
          (assoc field-stats :special-type :url))))))

(defn- values-are-valid-json?
  "`true` if at every item in VALUES is `nil` or a valid string-encoded JSON dictionary or array, and at least one of those is non-nil."
  [values]
  (try
    (loop [at-least-one-non-nil-value? false, [val & more] values]
      (cond
        (and (not val)
             (not (seq more))) at-least-one-non-nil-value?
        (s/blank? val)         (recur at-least-one-non-nil-value? more)
        ;; If val is non-nil, check that it's a JSON dictionary or array. We don't want to mark Fields containing other
        ;; types of valid JSON values as :json (e.g. a string representation of a number or boolean)
        :else                  (let [val (json/parse-string val)]
                                 (when (not (or (map? val)
                                                (sequential? val)))
                                   (throw (Exception.)))
                                 (recur true more))))
    (catch Throwable _
      false)))

(defn- test:json-special-type
  "Mark FIELD as `:json` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid serialized JSON dictionaries or arrays."
  [driver field field-stats]
  (if-not (and (not (:special_type field))
               (contains? #{:CharField :TextField} (:base_type field)))
    ;; this field isn't suited for this test
    field-stats
    ;; check for json values
    (if-not (values-are-valid-json? (->> (driver/field-values-lazy-seq driver field)
                                         (take driver/max-sync-lazy-seq-results)))
      field-stats
      (do
        (log/debug (u/format-color 'green "Field '%s' looks like it contains valid JSON objects. Setting special_type to :json." (field/qualified-name field)))
        (assoc field-stats :special-type :json, :preview-display false)))))

(defn- test:new-field
  "Do the various tests that should only be done for a new `Field`.
   We only run most of the field analysis work when the field is NEW in order to favor performance of the sync process."
  [driver field field-stats]
  (->> field-stats
       (test:no-preview-display driver field)
       (test:url-special-type   driver field)
       (test:json-special-type  driver field)))

(defn make-analyze-table
  "Make a generic implementation of `analyze-table`."
  [driver & {:keys [field-avg-length-fn field-percent-urls-fn]
             :or   {field-avg-length-fn   (partial driver/default-field-avg-length driver)
                    field-percent-urls-fn (partial driver/default-field-percent-urls driver)}}]
  (fn [driver table new-field-ids]
    (let [driver (assoc driver :field-avg-length field-avg-length-fn, :field-percent-urls field-percent-urls-fn)]
      {:row_count (u/try-apply table-row-count table)
       :fields    (for [{:keys [id] :as field} (table/fields table)]
                    (let [new-field? (contains? new-field-ids id)]
                      (cond->> {:id id}
                        (test-for-cardinality? field new-field?) (test:cardinality-and-extract-field-values field)
                        new-field?                               (test:new-field driver field))))})))

(defn generic-analyze-table
  "An implementation of `analyze-table` using the defaults (`default-field-avg-length` and `field-percent-urls`)."
  [driver table new-field-ids]
  ((make-analyze-table driver) driver table new-field-ids))
