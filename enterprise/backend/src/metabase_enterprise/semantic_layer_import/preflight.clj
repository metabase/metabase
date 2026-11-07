(ns metabase-enterprise.semantic-layer-import.preflight
  "A read-only check of an emitted tree against the app DB the import will run against: does every Database, Table and
  Field the cards name exist, and is it active?

  Serdes import never fails on a name it cannot resolve: for a Database it does not find it creates a stub (no
  connection details), for a Table or Field an inactive row (see
  [[metabase.models.serialization.resolve.default/import-table-fk]] and its neighbours), the import reports success, and
  the card fails when it is run. The import names things the way the driver says the warehouse stores them (see
  [[metabase-enterprise.semantic-layer-import.metadata]]: a name the project wrote unquoted is upper-cased for a driver
  with the `:upper-case-unquoted-identifiers` feature and lower-cased otherwise, a driver without the `:schemas` feature
  gets no schema), which an instance can still disagree with: a Snowflake account with `QUOTED_IDENTIFIERS_IGNORE_CASE`,
  a MySQL table created with a mixed-case name, a project built into one schema and synced from another. So [[check]]
  resolves every reference first, with the import's own walk ([[serdes/import-mbql]], [[metrics/import-dimensions]] and
  [[metrics/import-dimension-mappings]]) and the import's own lookups ([[serdes/load-find-local]]) but nothing that
  writes, and reports what the import would have made up, with what is there instead when a near miss (another letter
  case, another schema) explains it, and the config keys that fix it (`:identifier-case`, `:schema-mapping`).

  It runs against the current app DB, the one the REPL was started with, which has to be the instance the import
  command will be given (`MB_DB_CONNECTION_URI`)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.semantic-layer-import.db :as db]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metrics.core :as metrics]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::table-ref
  "A portable table reference as the YAML writes it: database name, schema (nil for a schemaless table), table name."
  [:tuple :string [:maybe :string] :string])

(mr/def ::field-ref
  "A portable field reference as the YAML writes it: a table reference followed by the field name (and the names of
  the nested fields under it, for a nested field)."
  [:cat :string [:maybe :string] :string [:+ :string]])

(mr/def ::unresolved
  "A reference the import would not bind to an active row: the model it names, the reference as the YAML writes it,
  and what is there instead, when something is: the row inactive, or a row whose name differs in letter case or
  schema."
  [:map {:closed true}
   [:model [:enum "Database" "Table" "Field"]]
   [:ref   [:or :string [:sequential [:maybe :string]]]]
   [:hint  :string]])

(mr/def ::card
  "A card with references the import would not bind: its name and `entity_id`, and the references."
  [:map {:closed true}
   [:name       :string]
   [:entity-id  ms/NanoIdString]
   [:unresolved [:sequential ::unresolved]]])

(mr/def ::report
  "The cards with references the import would not bind; empty when the import binds every reference."
  [:sequential ::card])

(mr/def ::entity
  "A Card as [[serialization/ingest-one]] reads it from YAML, keys as the import sees them."
  [:map {::mr/deliberately-open true, :description "a serdes Card entity, whose keys are the model's"}
   [:name      :string]
   [:entity_id ms/NanoIdString]])

(def ^:private placeholder-id
  "What the recording lookups return for a reference they cannot resolve, so that the walk goes on: an id no row has."
  Integer/MAX_VALUE)

(mu/defn- quoted-names :- :string
  "`names` for a message, quoted and comma-separated."
  [names :- [:sequential [:maybe :string]]]
  (str/join ", " (map pr-str names)))

(mu/defn- database-hint :- :string
  "Why the import would not find the Database named `db-name`: the name is the config's to get right."
  [db-name :- :string]
  (format (str "no Database named %s: the value under `:databases` in the config has to be the Metabase Database's"
               " name exactly, letter case included")
          (pr-str db-name)))

(def ^:private case-hint
  "What to change when a name differs from the instance's in letter case only: the import folds a name the project
  wrote unquoted the way the driver says its warehouse does, and the config can say otherwise."
  (str "a name the project wrote unquoted is upper-cased when the driver has the :upper-case-unquoted-identifiers"
       " feature and lower-cased otherwise; :identifier-case in the config (:upper, :lower or :as-is) overrides that"))

(def ^:private schema-hint
  "What to change when a table is there under another schema: the driver decides whether there is one at all, and the
  config can map each of the project's schemas to the instance's."
  (str "a driver without the :schemas feature gets a nil schema; :schema-mapping in the config maps a project's schema"
       " to the schema the instance has, or to nil"))

(mu/defn- table-hint :- :string
  "Why the import would not find the Table `table-ref` names in the Database `db-id`, which it did find."
  [db-id :- ::lib.schema.id/database
   [_db-name schema table-name :as _table-ref] :- ::table-ref]
  (let [same-name (filter #(= (u/lower-case-en (:name %)) (u/lower-case-en table-name))
                          (db/active-tables db-id))
        describe  (fn [{table-schema :schema, :keys [name]}]
                    (format "%s in schema %s" (pr-str name) (pr-str table-schema)))]
    (if (seq same-name)
      (format "no Table %s in schema %s; close: %s (the letter case or the schema differs; %s; %s)" (pr-str table-name)
              (pr-str schema) (str/join "; " (map describe same-name)) case-hint schema-hint)
      (format "no Table %s in schema %s; the database's schemas are %s (%s)" (pr-str table-name) (pr-str schema)
              (quoted-names (sort (db/active-table-schemas db-id))) schema-hint))))

(mu/defn- field-hint :- :string
  "Why the import would not find the Field `field-ref` names in the Table `table-id`, which it did find."
  [table-id :- ::lib.schema.id/table
   [_db-name _schema _table-name & field-names :as _field-ref] :- ::field-ref]
  (let [field-name (last field-names)
        names      (sort (db/field-names table-id))
        same-name  (filter #(= (u/lower-case-en %) (u/lower-case-en field-name)) names)]
    (cond
      (> (count field-names) 1)
      (format "no nested Field %s" (quoted-names field-names))

      (seq same-name)
      (format "no Field %s; the letter case differs from %s (%s)" (pr-str field-name) (quoted-names same-name)
              case-hint)

      :else
      (format "no Field %s; the table's fields are %s" (pr-str field-name) (quoted-names names)))))

(mu/defn- inactive-hint :- :string
  "What an inactive row means: the import, or an earlier one, made it up, or sync stopped seeing it."
  [model :- :string]
  (format (str "the %s exists but is inactive: a stub an earlier import created for a name it could not resolve,"
               " or a %s a sync no longer finds")
          model (u/lower-case-en model)))

(mu/defn- lookups :- [:map {:closed true}
                      [:database ifn?]
                      [:table    ifn?]
                      [:field    ifn?]]
  "The import's three lookups with the writes taken out: each finds its row with [[serdes/load-find-local]], the
  import's own query, and when there is no active row, records what is missing in `found`, an atom of
  `::unresolved`, and answers [[placeholder-id]]. A Table whose Database is missing, or a Field whose Table is, is not
  recorded on top of its parent."
  [found :- (ms/InstanceOfClass clojure.lang.Atom)]
  (let [record!  (fn [model portable-ref hint]
                   (swap! found conj {:model model, :ref portable-ref, :hint hint})
                   placeholder-id)
        database (fn [db-name]
                   (let [{:keys [id is_stub]} (serdes/load-find-local [{:model "Database" :id db-name}])]
                     (cond
                       (nil? id) (record! "Database" db-name (database-hint db-name))
                       is_stub   (record! "Database" db-name
                                          (str "the Database exists but is a stub an earlier import created for a name"
                                               " it could not resolve: it has no connection details"))
                       :else     id)))
        table    (fn [table-ref]
                   (let [db-id (database (first table-ref))]
                     (if (= db-id placeholder-id)
                       placeholder-id
                       (let [{:keys [id active]} (serdes/load-find-local (serdes/table->path table-ref))]
                         (cond
                           (nil? id)    (record! "Table" table-ref (table-hint db-id table-ref))
                           (not active) (record! "Table" table-ref (inactive-hint "Table"))
                           :else        id)))))
        field    (fn [field-ref]
                   (let [table-id (table (vec (take 3 field-ref)))]
                     (if (= table-id placeholder-id)
                       placeholder-id
                       ;; the import's Field lookup selects only the id
                       (let [{:keys [id]} (serdes/load-find-local (serdes/field->path field-ref))]
                         (cond
                           (nil? id)                   (record! "Field" field-ref (field-hint table-id field-ref))
                           (not (db/field-active? id)) (record! "Field" field-ref (inactive-hint "Field"))
                           :else                       id)))))]
    {:database database, :table table, :field field}))

(mu/defn unresolved-refs :- [:sequential ::unresolved]
  "The references in `card`, a Card as the import reads it, that the import would not bind to an active row, each
  once. The card's query, dimensions and dimension mappings are walked by the import's own functions, with its
  lookups replaced (see [[lookups]]); references to other Cards (a ratio or derived metric's `[:metric id]`) are the
  collection's own and are not checked."
  [card :- ::entity]
  (let [found (atom [])
        {:keys [database table field]} (lookups found)]
    (binding [serdes/*import-database-fk*     database
              serdes/*import-table-fk*        table
              serdes/*import-field-fk*        field
              serdes/*import-fk*              (fn [_entity-id _model] placeholder-id)
              serdes/*skip-schema-validation?* true]
      (serdes/import-mbql (:dataset_query card))
      (metrics/import-dimensions (:dimensions card))
      (metrics/import-dimension-mappings (:dimension_mappings card)))
    (vec (distinct @found))))

(mu/defn check :- ::report
  "Check every Card under `out-dir`, a serdes tree as [[metabase-enterprise.semantic-layer-import.emit/write!]] writes
  it, against the current app DB: the cards whose Database, Table or Field references the import would not bind to an
  active row, with what is there instead. Empty when the import binds everything, which is when to run it. Reads the
  tree the way the import does, so a file the import cannot read fails here too."
  [out-dir :- :string]
  (let [ingestion (serialization/ingest-yaml (io/file out-dir))
        paths     (vec (serialization/ingest-list ingestion))]
    (when-let [errors (seq (serialization/ingest-errors ingestion))]
      (throw (ex-info (format "%d file(s) under %s could not be read: %s" (count errors) out-dir
                              (str/join "; " (map ex-message errors)))
                      {:out-dir out-dir}
                      (first errors))))
    (vec (for [path  paths
               :when (= "Card" (-> path last :model))
               :let  [card       (serialization/ingest-one ingestion path)
                      unresolved (unresolved-refs card)]
               :when (seq unresolved)]
           {:name       (:name card)
            :entity-id  (:entity_id card)
            :unresolved unresolved}))))
