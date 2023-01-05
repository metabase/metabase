(ns metabase.models.serialization.util
  "Helpers intended to be shared by various models.
  Most of these are common operations done while (de)serializing several models, like handling a foreign key on a Table
  or user."
  (:require
   [cheshire.core :as json]
   [clojure.core.match :refer [match]]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [toucan.db :as db]
   [toucan.models :as models]))

;; -------------------------------------------- General Foreign Keys -------------------------------------------------
(defn export-fk
  "Given a numeric foreign key and its model (symbol, name or IModel), looks up the entity by ID and gets its entity ID
  or identity hash.
  Unusual parameter order means this can be used as `(update x :some_id export-fk 'SomeModel)`.

  NOTE: This works for both top-level and nested entities. Top-level entities like `Card` are returned as just a
  portable ID string.. Nested entities are returned as a vector of such ID strings."
  [id model]
  (when id
    (let [model-name (name model)
          model      (db/resolve-model (symbol model-name))
          entity     (db/select-one model (models/primary-key model) id)
          path       (mapv :id (serdes.base/serdes-generate-path model-name entity))]
      (if (= (count path) 1)
        (first path)
        path))))

(defn import-fk
  "Given an identifier, and the model it represents (symbol, name or IModel), looks up the corresponding
  entity and gets its primary key.

  The identifier can be a single entity ID string, a single identity-hash string, or a vector of entity ID and hash
  strings. If the ID is compound, then the last ID is the one that corresponds to the model. This allows for the
  compound IDs needed for nested entities like `DashboardCard`s to get their [[serdes.base/serdes-dependencies]].

  Throws if the corresponding entity cannot be found.

  Unusual parameter order means this can be used as `(update x :some_id import-fk 'SomeModel)`."
  [eid model]
  (when eid
    (let [model-name (name model)
          model      (db/resolve-model (symbol model-name))
          eid        (if (vector? eid)
                       (last eid)
                       eid)
          entity     (serdes.base/lookup-by-id model eid)]
      (if entity
        (get entity (models/primary-key model))
        (throw (ex-info "Could not find foreign key target - bad serdes-dependencies or other serialization error"
                        {:entity_id eid :model (name model)}))))))

(defn export-fk-keyed
  "Given a numeric ID, look up a different identifying field for that entity, and return it as a portable ID.
  Eg. `Database.name`.
  [[import-fk-keyed]] is the inverse.
  Unusual parameter order lets this be called as, for example, `(update x :creator_id export-fk-keyed 'Database :name)`.

  Note: This assumes the primary key is called `:id`."
  [id model field]
  (db/select-one-field field model :id id))

(defn import-fk-keyed
  "Given a single, portable, identifying field and the model it refers to, this resolves the entity and returns its
  numeric `:id`.
  Eg. `Database.name`.

  Unusual parameter order lets this be called as, for example,
  `(update x :creator_id import-fk-keyed 'Database :name)`."
  [portable model field]
  (db/select-one-id model field portable))

;; -------------------------------------------------- Users ----------------------------------------------------------
(defn export-user
  "Exports a user as the email address.
  This just calls [[export-fk-keyed]], but the counterpart [[import-user]] is more involved. This is a unique function
  so they form a pair."
  [id]
  (when id (export-fk-keyed id 'User :email)))

(defn import-user
  "Imports a user by their email address.
  If a user with that email address exists, returns its primary key.
  If no such user exists, creates a dummy one with the default settings, blank name, and randomized password.
  Does not send any invite emails."
  [email]
  (when email
    (or (import-fk-keyed email 'User :email)
        ;; Need to break a circular dependency here.
        (:id ((resolve 'metabase.models.user/serdes-synthesize-user!) {:email email})))))

;; -------------------------------------------------- Tables ---------------------------------------------------------
(defn export-table-fk
  "Given a numeric `table_id`, return a portable table reference.
  If the `table_id` is `nil`, return `nil`. This is legal for a native question.
  That has the form `[db-name schema table-name]`, where the `schema` might be nil.
  [[import-table-fk]] is the inverse."
  [table-id]
  (when table-id
    (let [{:keys [db_id name schema]} (db/select-one 'Table :id table-id)
          db-name                     (db/select-one-field :name 'Database :id db_id)]
      [db-name schema name])))

(defn import-table-fk
  "Given a `table_id` as exported by [[export-table-fk]], resolve it back into a numeric `table_id`.
  The input might be nil, in which case so is the output. This is legal for a native question."
  [[db-name schema table-name :as table-id]]
  (when table-id
    (db/select-one-field :id 'Table :name table-name :schema schema :db_id (db/select-one-field :id 'Database :name db-name))))

(defn table->path
  "Given a `table_id` as exported by [[export-table-fk]], turn it into a `[{:model ...}]` path for the Table.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}]))

(defn storage-table-path-prefix
  "The [[serdes.base/storage-path]] for Table is a bit tricky, and shared with Fields and FieldValues, so it's
  factored out here.
  Takes the :serdes/meta value for a `Table`!
  The return value includes the directory for the Table, but not the file for the Table itself.

  With a schema: `[\"databases\" \"db_name\" \"schemas\" \"public\" \"tables\" \"customers\"]`
  No schema:     `[\"databases\" \"db_name\" \"tables\" \"customers\"]`"
  [path]
  (let [db-name    (-> path first :id)
        schema     (when (= (count path) 3)
                     (-> path second :id))
        table-name (-> path last :id)]
    (concat ["databases" db-name]
            (when schema ["schemas" schema])
            ["tables" table-name])))

;; -------------------------------------------------- Fields ---------------------------------------------------------
(defn export-field-fk
  "Given a numeric `field_id`, return a portable field reference.
  That has the form `[db-name schema table-name field-name]`, where the `schema` might be nil.
  [[import-field-fk]] is the inverse."
  [field-id]
  (when field-id
    (let [{:keys [name table_id]}     (db/select-one 'Field :id field-id)
          [db-name schema field-name] (export-table-fk table_id)]
      [db-name schema field-name name])))

(defn import-field-fk
  "Given a `field_id` as exported by [[export-field-fk]], resolve it back into a numeric `field_id`."
  [[db-name schema table-name field-name :as field-id]]
  (when field-id
    (let [table_id (import-table-fk [db-name schema table-name])]
      (db/select-one-id 'Field :table_id table_id :name field-name))))

(defn field->path
  "Given a `field_id` as exported by [[export-field-fk]], turn it into a `[{:model ...}]` path for the Field.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name field-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}
                  {:model "Field" :id field-name}]))

;; ---------------------------------------------- MBQL Fields --------------------------------------------------------
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

(defn- export-source-table
  [source-table]
  (if (and (string? source-table)
           (str/starts-with? source-table "card__"))
    (export-fk (-> source-table
                   (str/split #"__")
                   second
                   Integer/parseInt)
               'Card)
    (export-table-fk source-table)))

(defn- ids->fully-qualified-names
  [entity]
  (mbql.u/replace entity
    mbql-entity-reference?
    (mbql-id->fully-qualified-name &match)

    sequential?
    (mapv ids->fully-qualified-names &match)

    map?
    (as-> &match entity
      (m/update-existing entity :database (fn [db-id]
                                            (if (= db-id mbql.s/saved-questions-virtual-database-id)
                                              "database/__virtual"
                                              (db/select-one-field :name 'Database :id db-id))))
      (m/update-existing entity :card_id #(export-fk % 'Card)) ; attibutes that refer to db fields use _
      (m/update-existing entity :card-id #(export-fk % 'Card)) ; template-tags use dash
      (m/update-existing entity :source-table export-source-table)
      (m/update-existing entity :source_table export-source-table)
      (m/update-existing entity :breakout    (fn [breakout]
                                               (mapv mbql-id->fully-qualified-name breakout)))
      (m/update-existing entity :aggregation (fn [aggregation]
                                               (mapv mbql-id->fully-qualified-name aggregation)))
      (m/update-existing entity :filter      ids->fully-qualified-names)
      (m/update-existing entity ::mb.viz/param-mapping-source export-field-fk)
      (m/update-existing entity :segment    export-fk 'Segment)
      (m/update-existing entity :snippet-id export-fk 'NativeQuerySnippet)
      (merge entity
             (m/map-vals ids->fully-qualified-names
                         (dissoc entity
                                 :database :card_id :card-id :source-table :breakout :aggregation :filter :segment
                                 ::mb.viz/param-mapping-source :snippet-id))))))


(defn export-mbql
  "Given an MBQL expression, convert it to an EDN structure and turn the non-portable Database, Table and Field IDs
  inside it into portable references."
  [encoded]
  (ids->fully-qualified-names encoded))

(defn- portable-id?
  "True if the provided string is either an Entity ID or identity-hash string."
  [s]
  (and (string? s)
       (or (serdes.base/entity-id? s)
           (serdes.hash/identity-hash? s))))

(defn- mbql-fully-qualified-names->ids*
  [entity]
  (mbql.u/replace entity
    ;; handle legacy `:field-id` forms encoded prior to 0.39.0
    ;; and also *current* expresion forms used in parameter mapping dimensions
    ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
    [(:or :field-id "field-id") fully-qualified-name]
    (mbql-fully-qualified-names->ids* [:field fully-qualified-name])

    [(:or :field "field") (fully-qualified-name :guard vector?) opts]
    [:field (import-field-fk fully-qualified-name) (mbql-fully-qualified-names->ids* opts)]
    [(:or :field "field") (fully-qualified-name :guard vector?)]
    [:field (import-field-fk fully-qualified-name)]


    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (fully-qualified-name :guard vector?)}
    (assoc &match :source-field (import-field-fk fully-qualified-name))

    {:database (fully-qualified-name :guard string?)}
    (-> &match
        (assoc :database (if (= fully-qualified-name "database/__virtual")
                           mbql.s/saved-questions-virtual-database-id
                           (db/select-one-id 'Database :name fully-qualified-name)))
        mbql-fully-qualified-names->ids*) ; Process other keys

    {:card-id (entity-id :guard portable-id?)}
    (-> &match
        (assoc :card-id (import-fk entity-id 'Card))
        mbql-fully-qualified-names->ids*) ; Process other keys

    [(:or :metric "metric") (fully-qualified-name :guard portable-id?)]
    [:metric (import-fk fully-qualified-name 'Metric)]

    [(:or :segment "segment") (fully-qualified-name :guard portable-id?)]
    [:segment (import-fk fully-qualified-name 'Segment)]

    (_ :guard (every-pred map? #(vector? (:source-table %))))
    (-> &match
        (assoc :source-table (import-table-fk (:source-table &match)))
        mbql-fully-qualified-names->ids*)

    (_ :guard (every-pred map? #(vector? (:source_table %))))
    (-> &match
        (assoc :source_table (import-table-fk (:source_table &match)))
        mbql-fully-qualified-names->ids*)

    (_ :guard (every-pred map? (comp portable-id? :source-table)))
    (-> &match
        (assoc :source-table (str "card__" (import-fk (:source-table &match) 'Card)))
        mbql-fully-qualified-names->ids*)

    (_ :guard (every-pred map? (comp portable-id? :source_table)))
    (-> &match
        (assoc :source_table (str "card__" (import-fk (:source_table &match) 'Card)))
        mbql-fully-qualified-names->ids*) ;; process other keys

    (_ :guard (every-pred map? (comp portable-id? :snippet-id)))
    (-> &match
        (assoc :snippet-id (import-fk (:snippet-id &match) 'NativeQuerySnippet))
        mbql-fully-qualified-names->ids*)))

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql-fully-qualified-names->ids* entity))

(defn import-mbql
  "Given an MBQL expression as an EDN structure with portable IDs embedded, convert the IDs back to raw numeric IDs."
  [exported]
  (mbql-fully-qualified-names->ids exported))


(declare ^:private mbql-deps-map)

(defn- mbql-deps-vector [entity]
  (match entity
         [:field     (field :guard vector?)]      #{(field->path field)}
         ["field"    (field :guard vector?)]      #{(field->path field)}
         [:field-id  (field :guard vector?)]      #{(field->path field)}
         ["field-id" (field :guard vector?)]      #{(field->path field)}
         [:field     (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         ["field"    (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         [:field-id  (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         ["field-id" (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
         [:metric    (field :guard portable-id?)] #{[{:model "Metric" :id field}]}
         ["metric"   (field :guard portable-id?)] #{[{:model "Metric" :id field}]}
         [:segment   (field :guard portable-id?)] #{[{:model "Segment" :id field}]}
         ["segment"  (field :guard portable-id?)] #{[{:model "Segment" :id field}]}
         :else (reduce #(cond
                          (map? %2)    (into %1 (mbql-deps-map %2))
                          (vector? %2) (into %1 (mbql-deps-vector %2))
                          :else %1)
                       #{}
                       entity)))

(defn- mbql-deps-map [entity]
  (->> (for [[k v] entity]
         (cond
           (and (= k :database)
                (string? v)
                (not= v "database/__virtual"))        #{[{:model "Database" :id v}]}
           (and (= k :source-table) (vector? v))      #{(table->path v)}
           (and (= k :source-table) (portable-id? v)) #{[{:model "Card" :id v}]}
           (and (= k :source-field) (vector? v))      #{(field->path v)}
           (and (= k :snippet-id)   (portable-id? v)) #{[{:model "NativeQuerySnippet" :id v}]}
           (and (= k :card_id)      (string? v))      #{[{:model "Card" :id v}]}
           (and (= k :card-id)      (string? v))      #{[{:model "Card" :id v}]}
           (map? v)                                   (mbql-deps-map v)
           (vector? v)                                (mbql-deps-vector v)))
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
  "Given the :parameter_mappings field of a `Card` or `DashboardCard`, as a vector of maps, converts
  it to a portable form with the field IDs replaced with `[db schema table field]` references."
  [mappings]
  (map ids->fully-qualified-names mappings))

(defn import-parameter-mappings
  "Given the :parameter_mappings field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs."
  [mappings]
  (->> mappings
       (map mbql-fully-qualified-names->ids)
       (map #(m/update-existing % :card_id import-fk 'Card))))

(defn export-parameters
  "Given the :parameter field of a `Card` or `Dashboard`, as a vector of maps, converts
  it to a portable form with the CardIds/FieldIds replaced with `[db schema table field]` references."
  [parameters]
  (map ids->fully-qualified-names parameters))

(defn import-parameters
  "Given the :parameter field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs."
  [parameters]
  (for [param parameters]
    (-> param
        mbql-fully-qualified-names->ids
        (m/update-existing-in [:values_source_config :card_id] import-fk 'Card))))

(defn parameters-deps
  "Given the :parameters (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [parameters]
  (reduce set/union #{}
          (for [parameter parameters
                :when (= "card" (:values_source_type parameter))
                :let  [config (:values_source_config parameter)]]
            (set/union #{[{:model "Card" :id (:card_id config)}]}
                       (mbql-deps-vector (:value_field config))))))

(defn- export-visualizations [entity]
  (mbql.u/replace
    entity
    ["field-id" (id :guard number?)]
    ["field-id" (export-field-fk id)]
    [:field-id (id :guard number?)]
    [:field-id (export-field-fk id)]

    ["field-id" (id :guard number?) tail]
    ["field-id" (export-field-fk id) (export-visualizations tail)]
    [:field-id (id :guard number?) tail]
    [:field-id (export-field-fk id) (export-visualizations tail)]

    ["field" (id :guard number?)]
    ["field" (export-field-fk id)]
    [:field (id :guard number?)]
    [:field (export-field-fk id)]

    ["field" (id :guard number?) tail]
    ["field" (export-field-fk id) (export-visualizations tail)]
    [:field (id :guard number?) tail]
    [:field (export-field-fk id) (export-visualizations tail)]

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
  "Given the `:visualization_settings` map, convert all its field-ids to portable `[db schema table field]` form."
  [settings]
  (when settings
    (-> settings
        export-visualizations
        (update :column_settings export-column-settings))))

(defn- import-visualizations [entity]
  (mbql.u/replace
    entity
    [(:or :field-id "field-id") (fully-qualified-name :guard vector?) tail]
    [:field-id (import-field-fk fully-qualified-name) (import-visualizations tail)]
    [(:or :field-id "field-id") (fully-qualified-name :guard vector?)]
    [:field-id (import-field-fk fully-qualified-name)]

    [(:or :field "field") (fully-qualified-name :guard vector?) tail]
    [:field (import-field-fk fully-qualified-name) (import-visualizations tail)]
    [(:or :field "field") (fully-qualified-name :guard vector?)]
    [:field (import-field-fk fully-qualified-name)]

    (_ :guard map?)
    (m/map-vals import-visualizations &match)

    (_ :guard vector?)
    (mapv import-visualizations &match)))

(defn- import-column-settings [settings]
  (when settings
    (update-keys settings #(-> % name json/parse-string import-visualizations json/generate-string))))

(defn import-visualization-settings
  "Given an EDN value as exported by [[export-visualization-settings]], convert its portable `[db schema table field]`
  references into Field IDs."
  [settings]
  (when settings
    (-> settings
        import-visualizations
        (update :column_settings import-column-settings))))

(defn visualization-settings-deps
  "Given the :visualization_settings (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [viz]
  (let [vis-column-settings (some->> viz
                                     :column_settings
                                     keys
                                     (map (comp mbql-deps json/parse-string name)))]
    (reduce set/union (cons (mbql-deps viz)
                            vis-column-settings))))
