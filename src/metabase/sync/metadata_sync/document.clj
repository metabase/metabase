(ns metabase.sync.metadata-sync.document
  "The document that describes one Table and its Fields to another Metabase instance.

  A document holds nothing that belongs to one instance. A Table is its schema and name, and a Field is a name path
  in its Table, so two instances with different ids describe the same warehouse table with the same document."
  (:require
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema])
  (:import
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

(def format-version
  "The version of the shape of what one instance sends another. A receiver refuses another version."
  1)

(def table-columns
  "The Table columns a document carries."
  [:schema :name :display_name :description :entity_type :visibility_type :data_layer :data_source :data_authority
   :field_order :caveats :points_of_interest :show_in_getting_started :owner_email :database_require_filter
   :is_writable])

(def left-out-table-columns
  "The Table columns serialization copies that a document does not carry, and why."
  {:active       "only active Tables are sent"
   :is_upload    "an upload belongs to the instance that made it"
   :is_published "publishing belongs to each instance"})

(def field-columns
  "The Field columns a document carries."
  [:base_type :effective_type :coercion_strategy :semantic_type :database_type
   :position :database_position :custom_position
   :database_is_pk :database_is_nullable :database_required :database_is_auto_increment :database_is_generated
   :database_default :database_indexed :database_partitioned
   :nfc_path :json_unfolding
   :display_name :description :visibility_type :caveats :points_of_interest :settings
   :has_field_values :preview_display :data_sensitivity
   :fingerprint :fingerprint_version :last_analyzed :dimension_interestingness])

(def left-out-field-columns
  "The Field columns serialization copies that a document does not carry as they are, and why."
  {:active "only active Fields are sent"
   :name   "sent as the last name of `:path`"})

(mr/def ::key
  "A Table's place in the order of a Database's Tables: its schema, nil first, then its name."
  [:tuple [:maybe :string] :string])

(mr/def ::schema-filter
  "Which schemas of a Database to describe, in the form of a Database's own schema filters."
  [:map {:closed true}
   [:type     [:enum "inclusion" "exclusion"]]
   [:patterns :string]])

(mr/def ::field
  [:map {::mr/deliberately-open true
         :description           "a Field's document: its name path, and each of `field-columns` that has a value"}
   [:path          [:sequential {:min 1} ms/NonBlankString]]
   [:base_type     ms/NonBlankString]
   [:last_analyzed {:optional true} ms/NonBlankString]])

(mr/def ::table
  [:map {::mr/deliberately-open true
         :description           "a Table's document: each of `table-columns` that has a value, and its Fields"}
   [:name   ms/NonBlankString]
   [:schema {:optional true} :string]
   [:fields [:sequential ::field]]])

(defn- wire-value
  "`value` as a document holds it: a keyword as its name, and a time as a string."
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

(defn- field-document [field]
  (-> (select-keys field field-columns)
      coercion-pair
      (update-vals wire-value)
      (assoc :path [(:name field)])
      u/remove-nils))

(defn- table-document [table field-documents]
  (-> (select-keys table table-columns)
      (update-vals wire-value)
      (assoc :fields field-documents)
      u/remove-nils))

(def database-columns
  "The Database columns that are sent. `default_schema` is not one: it depends on the login, so each instance reads
  its own."
  [:dbms_version :timezone])

(mr/def ::database
  [:map {:closed true}
   [:dbms_version {:optional true} [:map {::mr/deliberately-open true
                                          :description           "the version a driver reports, in its shape"}]]
   [:timezone     {:optional true} :string]])

(mu/defn database-document :- ::database
  "The values of `database`, a Database row, that are sent: each of [[database-columns]] that has one."
  [database :- [:map {::mr/deliberately-open true :description "a Database row"}]]
  (u/remove-nils (select-keys database database-columns)))

(defn- filter-patterns
  "The `[inclusion-patterns exclusion-patterns]` of `schema-filter`, either or both nil."
  [{filter-type :type patterns :patterns}]
  (case filter-type
    "inclusion" [patterns nil]
    "exclusion" [nil patterns]
    [nil nil]))

(defn- described-schema?
  "Whether Tables in `schema` are described: never the ones in a workspace's own schema, which no other instance has."
  [inclusion-patterns exclusion-patterns schema]
  (and (not (driver.u/workspace-isolated-schema? schema))
       (driver.s/include-schema? inclusion-patterns exclusion-patterns schema)))

(def query-batch-size
  "The most Table ids one app DB query takes. Some queries use each id three times, and Postgres allows 65,535
  parameters in a statement."
  1000)

(defn in-batches
  "The rows that `query` returns for `ids`, queried [[query-batch-size]] ids at a time."
  [query ids]
  (into [] (mapcat (comp query vec)) (partition-all query-batch-size ids)))

(defn table-key
  "The key of a Table row, a document or a link target with `:schema` and `:name`: `[schema name]`."
  [{table-schema :schema table-name :name}]
  [table-schema table-name])

(mu/defn described-tables :- [:sequential ::warehouse-schema.schema/table]
  "The Tables of the Database with `database-id` that documents describe: the active ones in the schemas
  `schema-filter` allows, or in every schema when it is nil, and never one in a workspace's own schema. A Database
  whose driver has no schemas ignores the filter. They are in key order: by schema, nil first, then by name, compared
  in Clojure and not by the app DB's collation."
  [database-id   :- ::lib.schema.id/database
   schema-filter :- [:maybe ::schema-filter]]
  (let [database    (sync.db/database database-id)
        [incl excl] (when (driver.u/supports? (:engine database) :schemas database)
                      (filter-patterns schema-filter))]
    (->> (sync.db/described-tables database-id)
         (filter #(described-schema? incl excl (:schema %)))
         (sort-by table-key)
         vec)))

(mu/defn table-documents :- [:sequential ::table]
  "The documents of `tables`, which are rows from [[described-tables]], in the same order. A nested Field is not part
  of a document."
  [tables :- [:sequential ::warehouse-schema.schema/table]]
  (let [fields-by-table (group-by :table_id (in-batches sync.db/described-fields (mapv :id tables)))]
    (mapv (fn [{table-id :id :as table}]
            (table-document table (mapv field-document (fields-by-table table-id []))))
          tables)))
