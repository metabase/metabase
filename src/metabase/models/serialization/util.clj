(ns metabase.models.serialization.util
  "Helpers intended to be shared by various models.
  Most of these are common operations done while (de)serializing several models, like handling a foreign key on a Table
  or user."
  (:require [cheshire.core :as json]
            [clojure.core.match :refer [match]]
            [clojure.set :as set]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [toucan.db :as db]
            [toucan.models :as models]))

;; -------------------------------------------- General Foreign Keys -------------------------------------------------
(defn export-fk
  "Given a numeric foreign key and its model (symbol, name or IModel), looks up the entity by ID and gets its entity ID
  or identity hash.
  Unusual parameter order means this can be used as `(update x :some_id export-fk 'SomeModel)`."
  [id model]
  (when id
    (let [model-name (name model)
          model      (db/resolve-model (symbol model-name))
          entity     (db/select-one model (models/primary-key model) id)
          {eid :id}  (serdes.base/infer-self-path model-name entity)]
      eid)))

(defn import-fk
  "Given an entity ID or identity hash, and the model it represents (symbol, name or IModel), looks up the corresponding
  entity and gets its primary key.

  Throws if the corresponding entity cannot be found.

  Unusual parameter order means this can be used as `(update x :some_id import-fk 'SomeModel)`."
  [eid model]
  (when eid
    (let [model-name (name model)
          model      (db/resolve-model (symbol model-name))
          entity     (serdes.base/lookup-by-id model eid)]
      (if entity
        (get entity (models/primary-key model))
        (throw (ex-info "Could not find foreign key target - bad serdes-dependencies or other serialization error"
                        {:entity_id eid :model (name model)}))))))

(defn export-fk-keyed
  "Given a numeric ID, look up a different identifying field for that entity, and return it as a portable ID.
  Eg. `User.email`, `Database.name`.
  [[import-fk-keyed]] is the inverse.
  Unusual parameter order lets this be called as, for example, `(update x :creator_id export-fk-keyed 'User :email).

  Note: This assumes the primary key is called `:id`."
  [id model field]
  (db/select-one-field field model :id id))

(defn import-fk-keyed
  "Given a single, portable, identifying field and the model it refers to, this resolves the entity and returns its
  numeric `:id`.
  Eg. `User.email` or `Database.name`.

  Unusual parameter order lets this be called as, for example, `(update x :creator_id import-fk-keyed 'User :email)`."
  [portable model field]
  (db/select-one-id model field portable))

;; -------------------------------------------------- Tables ---------------------------------------------------------
(defn export-table-fk
  "Given a numeric `table_id`, return a portable table reference.
  That has the form `[db-name schema table-name]`, where the `schema` might be nil.
  [[import-table-fk]] is the inverse."
  [table-id]
  (let [{:keys [db_id name schema]} (db/select-one 'Table :id table-id)
        db-name                     (db/select-one-field :name 'Database :id db_id)]
    [db-name schema name]))

(defn import-table-fk
  "Given a `table_id` as exported by [[export-table-fk]], resolve it back into a numeric `table_id`."
  [[db-name schema table-name]]
  (db/select-one-field :id 'Table :name table-name :schema schema :db_id (db/select-one-field :id 'Database :name db-name)))

(defn table->path
  "Given a `table_id` as exported by [[export-table-fk]], turn it into a `[{:model ...}]` path for the Table.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}]))

;; -------------------------------------------------- Fields ---------------------------------------------------------
(defn export-field-fk
  "Given a numeric `field_id`, return a portable field reference.
  That has the form `[db-name schema table-name field-name]`, where the `schema` might be nil.
  [[import-field-fk]] is the inverse."
  [field-id]
  (let [{:keys [name table_id]}     (db/select-one 'Field :id field-id)
        [db-name schema field-name] (export-table-fk table_id)]
    [db-name schema field-name name]))

(defn import-field-fk
  "Given a `field_id` as exported by [[export-field-fk]], resolve it back into a numeric `field_id`."
  [[db-name schema table-name field-name]]
  (let [table_id (import-table-fk [db-name schema table-name])]
    (db/select-one-id 'Field :table_id table_id :name field-name)))

(defn field->path
  "Given a `field_id` as exported by [[export-field-fk]], turn it into a `[{:model ...}]` path for the Field.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name field-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}
                  {:model "Field" :id field-name}]))

;; ---------------------------------------------- JSON-encoded MBQL --------------------------------------------------
(defn- mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  [form]
  (mbql.normalize/is-clause? #{:field :field-id :fk-> :dimension :metric :segment} form))

(defn- mbql-id->fully-qualified-name
  [mbql]
  (-> mbql
      mbql.normalize/normalize-tokens
      (mbql.u/replace
        ;; `integer?` guard is here to make the operation idempotent
        [:field (id :guard integer?) opts]
        [:field (export-field-fk id) (mbql-id->fully-qualified-name opts)]

        ;; `integer?` guard is here to make the operation idempotent
        [:field (id :guard integer?)]
        [:field (export-field-fk id)]

        ;; field-id is still used within parameter mapping dimensions
        ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
        [:field-id (id :guard integer?)]
        [:field-id (export-field-fk id)]

        {:source-table (id :guard integer?)}
        (assoc &match :source-table (export-table-fk id))

        ;; source-field is also used within parameter mapping dimensions
        ;; example relevant clause - [:field 2 {:source-field 1}]
        {:source-field (id :guard integer?)}
        (assoc &match :source-field (export-field-fk id))

        [:dimension (dim :guard vector?)]
        [:dimension (mbql-id->fully-qualified-name dim)]

        [:metric (id :guard integer?)]
        [:metric (export-fk id 'Metric)]

        [:segment (id :guard integer?)]
        [:segment (export-fk id 'Segment)])))

(defn- ids->fully-qualified-names
  [entity]
  (mbql.u/replace entity
    mbql-entity-reference?
    (mbql-id->fully-qualified-name &match)

    map?
    (as-> &match entity
      (m/update-existing entity :database (fn [db-id]
                                            (if (= db-id mbql.s/saved-questions-virtual-database-id)
                                              "database/__virtual"
                                              (db/select-one-field :name 'Database :id db-id))))
      (m/update-existing entity :card_id #(export-fk % 'Card)) ; attibutes that refer to db fields use _
      (m/update-existing entity :card-id #(export-fk % 'Card)) ; template-tags use dash
      (m/update-existing entity :source-table (fn [source-table]
                                                (if (and (string? source-table)
                                                         (str/starts-with? source-table "card__"))
                                                  (export-fk (-> source-table
                                                                 (str/split #"__")
                                                                 second
                                                                 Integer/parseInt)
                                                             'Card)
                                                  (export-table-fk source-table))))
      (m/update-existing entity :breakout (fn [breakout]
                                            (map mbql-id->fully-qualified-name breakout)))
      (m/update-existing entity :aggregation (fn [aggregation]
                                               (m/map-vals mbql-id->fully-qualified-name aggregation)))
      (m/update-existing entity :filter (fn [filter]
                                          (m/map-vals mbql-id->fully-qualified-name filter)))
      (m/update-existing entity ::mb.viz/param-mapping-source export-field-fk)
      (m/update-existing entity :snippet-id export-fk 'NativeQuerySnippet)
      (m/map-vals ids->fully-qualified-names entity))))

(defn export-json-mbql
  "Given a JSON string with an MBQL expression inside it, convert it to an EDN structure and turn the non-portable
  Database, Table and Field IDs inside it into portable references. Returns it as an EDN structure, which is more
  human-fiendly in YAML."
  [encoded]
  (-> encoded
      (json/parse-string true)
      ids->fully-qualified-names))

(defn- mbql-fully-qualified-names->ids*
  [entity]
  (mbql.u/replace entity
    ;; handle legacy `:field-id` forms encoded prior to 0.39.0
    ;; and also *current* expresion forms used in parameter mapping dimensions
    ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
    [:field-id (fully-qualified-name :guard string?)]
    (mbql-fully-qualified-names->ids* [:field fully-qualified-name nil])

    [:field (fully-qualified-name :guard vector?) opts]
    [:field (import-field-fk fully-qualified-name) (mbql-fully-qualified-names->ids* opts)]

    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (fully-qualified-name :guard vector?)}
    (assoc &match :source-field (import-field-fk fully-qualified-name))

    {:database (fully-qualified-name :guard string?)}
    (-> &match
        (assoc :database (db/select-one-id 'Database :name fully-qualified-name))
        mbql-fully-qualified-names->ids*) ; Process other keys

    [:metric (fully-qualified-name :guard serdes.base/entity-id?)]
    [:metric (import-fk fully-qualified-name 'Metric)]

    [:segment (fully-qualified-name :guard serdes.base/entity-id?)]
    [:segment (import-fk fully-qualified-name 'Segment)]

    (_ :guard (every-pred map? #(vector? (:source-table %))))
    (-> &match
        (assoc :source-table (import-table-fk (:source-table &match)))
        mbql-fully-qualified-names->ids*))) ;; process other keys

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql-fully-qualified-names->ids* entity))

(defn import-json-mbql
  "Given an MBQL expression as an EDN structure with portable IDs embedded, convert the IDs back to raw numeric IDs
  and then convert the result back into a JSON string."
  [exported]
  (-> exported
      mbql-fully-qualified-names->ids
      json/generate-string))


(declare ^:private mbql-deps-map)

(defn- mbql-deps-vector [entity]
  (match entity
         [:field     (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         ["field"    (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         [:field-id  (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         ["field-id" (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         :else (reduce #(cond
                          (map? %2)    (into %1 (mbql-deps-map %2))
                          (vector? %2) (into %1 (mbql-deps-vector %2))
                          :else %1)
                       #{}
                       entity)))

(defn- mbql-deps-map [entity]
  (->> (for [[k v] entity]
         (cond
           (and (= k :database)     (string? v)) #{[{:model "Database" :id v}]}
           (and (= k :source-table) (vector? v)) #{(table->path v)}
           (and (= k :source-field) (vector? v)) #{(field->path v)}
           (map? v)                              (mbql-deps-map v)
           (vector? v)                           (mbql-deps-vector v)))
       (reduce set/union #{})))

(defn mbql-deps
  "Given an MBQL expression as exported, with qualified names like `[\"some-db\" \"schema\" \"table_name\"]` instead of
  raw IDs, return the corresponding set of serdes-dependencies. The query can't be imported until all the referenced
  databases, tables and fields are loaded."
  [entity]
  (cond
    (map? entity)     (mbql-deps-map entity)
    (seqable? entity) (mbql-deps-vector entity)
    :else             (mbql-deps-vector [entity])))

(defn export-parameter-mappings
  "Given the :parameter_mappings field of a `Card` or `DashboardCard`, as a JSON-encoded list of objects, converts
  it to a portable form with the field IDs replaced with `[db schema table field]` references."
  [mappings]
  (->> (json/parse-string mappings true)
       (map ids->fully-qualified-names)))

(defn import-parameter-mappings
  "Given the :parameter_mappings field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs, and encode it back into JSON."
  [mappings]
  (->> mappings
       (map mbql-fully-qualified-names->ids)
       (map #(m/update-existing % :card_id import-fk 'Card))
       json/generate-string))

(defn- export-visualizations [entity]
  (mbql.u/replace
    entity
    ["field-id" (id :guard number?) tail]
    ["field-id" (export-field-fk id) (export-visualizations tail)]

    ["field" (id :guard number?) tail]
    ["field" (export-field-fk id) (export-visualizations tail)]

    (_ :guard map?)
    (m/map-vals export-visualizations &match)

    (_ :guard vector?)
    (mapv export-visualizations &match)))

(defn- export-column-settings
  "Column settings use a JSON-encoded string as a map key, and it contains field numbers.
  This function parses those keys, converts the IDs to portable values, and serializes them back to JSON."
  [settings]
  (when settings
    (update-keys settings #(-> % json/parse-string export-visualizations json/generate-string))))

(defn export-visualization-settings
  "Given a JSON string encoding the visualization settings for a `Card` or `DashboardCard`, transform it to EDN and
  convert all field-ids to portable `[db schema table field]` form."
  [settings]
  (when settings
    (-> settings
        (json/parse-string (fn [k] (if (re-matches #"^[a-zA-Z0-9_\.\-]+$" k)
                                     (keyword k)
                                     k)))
        export-visualizations
        (update :column_settings export-column-settings))))

(defn- import-visualizations [entity]
  (mbql.u/replace
    entity
    [:field-id (fully-qualified-name :guard vector?) tail]
    [:field-id (import-field-fk fully-qualified-name) (import-visualizations tail)]

    ["field-id" (fully-qualified-name :guard vector?) tail]
    ["field-id" (import-field-fk fully-qualified-name) (import-visualizations tail)]

    [:field (fully-qualified-name :guard vector?) tail]
    [:field (import-field-fk fully-qualified-name) (import-visualizations tail)]

    ["field" (fully-qualified-name :guard vector?) tail]
    ["field" (import-field-fk fully-qualified-name) (import-visualizations tail)]

    (_ :guard map?)
    (m/map-vals import-visualizations &match)

    (_ :guard vector?)
    (mapv import-visualizations &match)))

(defn- import-column-settings [settings]
  (when settings
    (update-keys settings #(-> % json/parse-string import-visualizations json/generate-string))))

(defn import-visualization-settings
  "Given an EDN value as exported by [[export-visualization-settings]], convert its portable `[db schema table field]`
  references into Field IDs and serialize back to JSON."
  [settings]
  (when settings
    (-> settings
        import-visualizations
        (update :column_settings import-column-settings)
        json/generate-string)))

(defn visualization-settings-deps
  "Given the :visualization_settings (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [viz]
  (let [vis-column-settings (some->> viz
                                     :column_settings
                                     keys
                                     (map (comp mbql-deps json/parse-string)))]
    (reduce set/union (cons (mbql-deps viz)
                            vis-column-settings))))
