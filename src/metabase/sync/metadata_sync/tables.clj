(ns metabase.sync.metadata-sync.tables
  "The tables kind of metadata that one Metabase sends another: each Table with its columns and its Fields, and which
  Tables of a Database are sent.

  A Table's entry holds nothing that belongs to one instance. A Table is its schema and name, and a Field is a name
  path in its Table, so two instances with different ids describe the same warehouse table with the same entry."
  (:require
   [medley.core :as m]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings])
  (:import
   (java.time.temporal Temporal)
   (java.util.regex PatternSyntaxException)))

(set! *warn-on-reflection* true)

(def table-columns
  "The Table columns an entry carries."
  [:schema :name :display_name :description :entity_type :visibility_type :data_layer :data_source :data_authority
   :field_order :caveats :points_of_interest :show_in_getting_started :owner_email :database_require_filter])

(def left-out-table-columns
  "The Table columns serialization copies that an entry does not carry, and why."
  {:active       "only active Tables are sent"
   :is_upload    "an upload belongs to the instance that made it"
   :is_published "publishing belongs to each instance"
   :is_writable  "it depends on the login, so each instance reads its own"})

(def sent-data-sources
  "The values of a Table's `data_source` that are sent: the ones that say what the data is. `metabase-transform` and
  `upload` say how one instance made the Table, with a transform or an upload that another instance does not have."
  #{"ingested" "source-data" "transform" "unknown"})

(def field-user-set-columns
  "The Field columns an entry can name in `user_set`: the ones a user can set that sync also writes."
  (sort (map name (keys warehouse-schema.user-settings/field-set-flags))))

(def table-user-set-columns
  "The Table columns an entry can name in `user_set`: the ones a user can set that something else also writes."
  (sort (map name (keys warehouse-schema.user-settings/table-set-flags))))

(def field-columns
  "The Field columns an entry carries."
  [:base_type :effective_type :coercion_strategy :semantic_type :database_type
   :position :database_position :custom_position
   :database_is_pk :database_is_nullable :database_required :database_is_auto_increment :database_is_generated
   :database_default :database_indexed :database_partitioned
   :nfc_path :json_unfolding
   :display_name :description :visibility_type :caveats :points_of_interest :settings
   :has_field_values :preview_display :data_sensitivity
   :fingerprint :fingerprint_version :last_analyzed :dimension_interestingness])

(def left-out-field-columns
  "The Field columns serialization copies that an entry does not carry as they are, and why."
  {:active "only active Fields are sent"
   :name   "sent as the last name of `:path`"})

(mr/def ::schema-filter
  "Which schemas of a Database to send, in the form of a Database's own schema filters."
  [:map {:closed true}
   [:type     [:enum "inclusion" "exclusion"]]
   [:patterns :string]])

(def max-path-length
  "The most names a Field's path has: a Field nested deeper is not sent."
  50)

(mr/def ::field
  [:map {:description "a Field's entry: its name path, and each of `field-columns` that has a value"}
   [:path          [:sequential {:min 1 :max max-path-length} ms/NonBlankString]]
   [:base_type     ms/NonBlankString]
   [:database_type ms/NonBlankString]
   [:last_analyzed {:optional true} ms/NonBlankString]
   ;; a column name that only a newer version knows is left out by the receiver
   [:user_set      {:optional true} [:sequential {:min 1} ms/NonBlankString]]])

(mr/def ::table
  [:map {:description "a Table's entry: each of `table-columns` that has a value, and its Fields"}
   [:name        ms/NonBlankString]
   [:schema      {:optional true} :string]
   ;; a value or a column name that only a newer version knows is left out by the receiver
   [:data_source {:optional true} ms/NonBlankString]
   [:user_set    {:optional true} [:sequential {:min 1} ms/NonBlankString]]
   [:fields      [:sequential ::field]]])

(defn- wire-value
  "`value` as an entry holds it: a keyword as its name, and a time as a string."
  [value]
  (cond
    (keyword? value)           (u/qualified-name value)
    (instance? Temporal value) (u.date/format value)
    :else                      value))

(defn- coercion-pair
  "`field` with its effective type only when a coercion produces it: without one it repeats the base type."
  [field]
  (cond-> field
    (not (:coercion_strategy field)) (dissoc :effective_type)))

(defn- user-set
  "The names of the columns that the settings row `flags` says a user set, in a fixed order, or nil when it says none.
  `column->flag` gives each column's flag."
  [column->flag flags]
  (not-empty (vec (sort (for [[column flag] column->flag
                              :when         (true? (get flags flag))]
                          (name column))))))

(def ^:private sensitive-left-out-columns
  "The columns of a sensitive Field that are not sent. Its fingerprint holds values of its column, such as the least
  and the greatest, and sync no longer keeps it up to date, so the analysis columns go with it."
  [:fingerprint :fingerprint_version :last_analyzed])

(defn- without-analysis-of-sensitive
  "`field` without the [[sensitive-left-out-columns]] when it is sensitive."
  [field]
  (if (= :sensitive (keyword (:visibility_type field)))
    (apply dissoc field sensitive-left-out-columns)
    field))

(defn- field-user-set
  "The names of the columns that `flags` says a user set on `field`. An FK target a user set is named only when the
  Field has none, which a user cleared: one with a target says so on its link."
  [field flags]
  (let [names (user-set warehouse-schema.user-settings/field-set-flags flags)]
    (not-empty (vec (cond->> names
                      (some? (:fk_target_field_id field)) (remove #{"fk_target_field_id"}))))))

(defn- field-entry [field path flags]
  (-> (select-keys field field-columns)
      without-analysis-of-sensitive
      coercion-pair
      (update-vals wire-value)
      (assoc :path path
             :user_set (field-user-set field flags))
      u/remove-nils))

(defn- field-paths
  "The name path of each of `fields`, the Fields of one Table, by Field id: the names of its parents, top-level first,
  then its own. A Field with a parent that is not in `fields` has none."
  [fields]
  (let [by-id (m/index-by :id fields)]
    (letfn [(path [{:keys [parent_id] field-name :name} depth]
              (cond
                (nil? parent_id)            [field-name]
                (>= depth max-path-length) nil
                :else                       (some-> (by-id parent_id) (path (inc depth)) (conj field-name))))]
      (into {} (keep (fn [field] (some->> (path field 1) (vector (:id field))))) fields))))

(defn- field-entries
  "The entries of `fields`, the Fields of one Table, parents before their children. A Field with a parent that is not
  sent is not sent. `flags-by-field` holds the settings row of each Field that has a user-set column."
  [fields flags-by-field]
  (let [paths (field-paths fields)]
    (->> fields
         (keep (fn [{field-id :id :as field}]
                 (when-let [path (paths field-id)]
                   (field-entry field path (flags-by-field field-id)))))
         (sort-by (comp count :path))
         vec)))

(defn- without-unsent-data-source
  "The Table `entry` without a data source that is not sent, and without its name in `user_set`."
  [{:keys [data_source] :as entry}]
  (if (or (nil? data_source) (sent-data-sources data_source))
    entry
    (-> (dissoc entry :data_source)
        (update :user_set #(not-empty (vec (remove #{"data_source"} %)))))))

(defn- table-entry [table field-entries flags]
  (-> (select-keys table table-columns)
      (update-vals wire-value)
      (assoc :fields   field-entries
             :user_set (user-set warehouse-schema.user-settings/table-set-flags flags))
      without-unsent-data-source
      u/remove-nils))

(defn- filter-patterns
  "The `[inclusion-patterns exclusion-patterns]` of `schema-filter`, either or both nil."
  [{filter-type :type patterns :patterns}]
  (case filter-type
    "inclusion" [patterns nil]
    "exclusion" [nil patterns]
    [nil nil]))

(defn valid-schema-filter?
  "Whether the patterns of `schema-filter` can be read: a Database's schema filter is used as a regular expression."
  [{:keys [patterns]}]
  (try
    (driver.s/schema-pattern->re-pattern patterns)
    true
    (catch PatternSyntaxException _
      false)))

(defn- sent-schema?
  "Whether Tables in `schema` are sent: never the ones in a workspace's own schema, which no other instance has."
  [inclusion-patterns exclusion-patterns schema]
  (and (not (driver.u/workspace-isolated-schema? schema))
       (driver.s/include-schema? inclusion-patterns exclusion-patterns schema)))

(mu/defn selection :- [:sequential ::sync.db/described-table]
  "The Tables of the Database with `database-id` that are sent, as `id`, `schema`, `name` and `estimated_row_count`:
  the active ones in the schemas `schema-filter` allows, or in every schema when it is nil, and never one in a
  workspace's own schema. A Database whose driver has no schemas ignores the filter. They are in key order: by schema,
  nil first, then by name, compared in Clojure and not by the app DB's collation."
  [database-id   :- ::lib.schema.id/database
   schema-filter :- [:maybe ::schema-filter]]
  (let [database    (sync.db/database database-id)
        [incl excl] (when (driver.u/supports? (:engine database) :schemas database)
                      (filter-patterns schema-filter))]
    (->> (sync.db/described-tables database-id)
         (filter #(sent-schema? incl excl (:schema %)))
         (sort-by pages/table-key)
         vec)))

(mu/defn entries :- [:sequential ::table]
  "The entries of `tables`, which are rows from [[selection]], in the same order."
  [tables :- [:sequential ::sync.db/described-table]]
  (let [table-ids       (mapv :id tables)
        rows            (u/index-by :id (pages/in-batches sync.db/tables-with-ids table-ids))
        fields-by-table (group-by :table_id (pages/in-batches sync.db/described-fields table-ids))
        flags-by-table  (m/index-by :table_id (pages/in-batches sync.db/table-user-set-flags table-ids))
        flags-by-field  (m/index-by :field_id (pages/in-batches sync.db/field-user-set-flags table-ids))]
    (into []
          (keep (fn [{table-id :id}]
                  (when-let [table (rows table-id)]
                    (table-entry table
                                 (field-entries (fields-by-table table-id []) flags-by-field)
                                 (flags-by-table table-id)))))
          tables)))
