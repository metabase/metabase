(ns metabase-enterprise.semantic-layer-import.metadata
  "A Lib metadata provider over a parsed semantic layer, so the import builds its queries with Lib instead of
  writing MBQL by hand.

  Each Metabase database in the config gets a provider holding one Table per IR table whose relation lives in it and
  one Field per documented column, all with ids made up here. Lib only needs ids to be consistent within a
  provider; [[portable-table-ref]] and [[portable-field-ref]] turn them back into the names serdes writes. A column an
  aggregation or filter names but the project never documented is added when first asked for (see [[column]]), with no
  known type.

  Each metric the resolve stage converts is added as a Metric card (see [[add-metric!]]), so a ratio or derived
  metric's `[:metric id]` references resolve, and [[portable-card-ref]] turns a card id back into the `entity_id`
  serdes writes.

  Base types come from the project's declared `data_type` through the driver's own type mapping; see [[base-type]].
  The provider's Database carries the driver's features (see [[driver-features]]), so the resolve stage can tell which
  clauses the warehouse could not run.

  The Tables and Fields are named as sync sees them, not as the project spells them: serdes import matches the names
  the YAML writes exactly, letter case and schema included, and makes up an inactive stub for a miss. A source names
  relations and columns in the project's spelling, and only the parts the project quoted when it built the table
  reach the warehouse as written (the IR records which, see `::ir/relation` and `::ir/column`); a warehouse
  folds the others, to upper case when the driver has the `:upper-case-unquoted-identifiers` feature and to lower case
  otherwise, which the config's `:identifier-case` overrides (see [[identifier-case]]). A driver without the `:schemas`
  feature syncs its tables with no schema, and the config's `:schema-mapping` says otherwise per schema (see
  [[physical-table]])."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.schemas.config :as config]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (metabase.lib.metadata.cached_provider CachedProxyMetadataProvider)))

(set! *warn-on-reflection* true)

(mu/defn- normalize-type-name :- :string
  "`VARCHAR(255)` → `varchar`, `timestamp(6) with time zone` → `timestamp with time zone`, `DOUBLE  PRECISION` →
  `double precision`: lower-cased, without length or precision arguments, single-spaced. The form a driver's type map
  is keyed by, give or take case."
  [s :- :string]
  (-> s
      u/lower-case-en
      (str/replace #"\s*\([^)]*\)" "")
      (str/replace #"\s+" " ")
      str/trim))

(def ^:private array-type-re
  "`integer[]`, `numeric(10,2)[]`: a warehouse array type."
  #"\[\s*\]$")

(mu/defn base-type :- [:maybe ::lib.schema.common/base-type]
  "The Metabase base type for a warehouse `data-type` string, as the `driver` maps it during sync, or nil when it is
  unknown or missing. Only a JDBC driver has the mapping (see [[config/jdbc-driver?]]); the `::config/driver`
  schema says so where it is checked, and this fails the same way where it is not."
  [driver    :- ::config/driver
   data-type :- [:maybe :string]]
  (when-not (config/jdbc-driver? driver)
    (throw (ex-info (format (str "%s is not a JDBC driver: the import types columns through the driver's sql-jdbc"
                                 " type mapping")
                            driver)
                    {:driver driver})))
  (when-not (str/blank? data-type)
    (let [type-name (normalize-type-name data-type)]
      ;; an array is an array; Metabase does not type the elements
      (if (re-find array-type-re type-name)
        :type/*
        ;; Postgres keys its type map by lower-case names, MySQL and H2 by upper-case ones
        (some (fn [f]
                (sql-jdbc.sync/database-type->base-type driver (keyword (f type-name))))
              [identity
               u/upper-case-en])))))

(mu/defn find-named :- [:maybe [:or ::ir/column ::lib.schema.metadata/column]]
  "The IR column or Field among `named` (nil for none) called `the-name`: matched exactly, or failing that ignoring
  case, since a warehouse may fold the case of an unquoted identifier and a project write it either way."
  [named    :- [:maybe [:sequential [:or ::ir/column ::lib.schema.metadata/column]]]
   the-name :- :string]
  (or (m/find-first #(= the-name (:name %)) named)
      (m/find-first #(= (u/lower-case-en the-name) (u/lower-case-en (:name %))) named)))

(mu/defn table-database :- [:maybe :string]
  "The Metabase database the config maps `table`'s warehouse database to; nil when it maps none."
  [config             :- ::config/config
   {:keys [relation]} :- ::ir/table]
  (get-in config [:databases (:database relation)]))

(mr/def ::id
  "An id made up here for a Table, Field or Card of a provider: consistent within the provider, and meaningless
  outside it, where [[portable-table-ref]], [[portable-field-ref]] and [[portable-card-ref]] turn it back into names."
  ms/PositiveInt)

(mu/defn- fold :- :string
  "`identifier`, written without quotes, as a warehouse that treats a bare identifier as `identifier-case` says stores
  it."
  [identifier-case :- ::config/identifier-case
   identifier      :- :string]
  (case identifier-case
    :upper (u/upper-case-en identifier)
    :lower (u/lower-case-en identifier)
    :as-is identifier))

(mu/defn identifier-case :- ::config/identifier-case
  "How the warehouse stores an identifier the project wrote without quotes, which is how sync sees it: the config's
  `:identifier-case` when it has one, else `:upper` when `features`, the driver's, has
  `:upper-case-unquoted-identifiers` (Snowflake, Oracle, H2) and `:lower` otherwise, which is what Postgres, Redshift
  and the Trino family do. A warehouse that keeps the spelling (MySQL, SQL Server, SQLite, BigQuery) whose project
  writes mixed-case names unquoted, or a Snowflake account with `QUOTED_IDENTIFIERS_IGNORE_CASE`, needs the config to
  say so."
  [config   :- ::config/config
   features :- [:set :keyword]]
  (or (:identifier-case config)
      (if (contains? features :upper-case-unquoted-identifiers) :upper :lower)))

(mr/def ::naming
  "How the warehouse behind a provider names what the project wrote: the case it stores a bare identifier in, whether
  it has schemas at all (the driver's `:schemas` feature), and the config's `:schema-mapping`."
  [:map {:closed true}
   [:identifier-case ::config/identifier-case]
   [:schemas?        :boolean]
   [:schema-mapping  [:map-of :string [:maybe :string]]]])

(mu/defn- naming :- ::naming
  "The `::naming` of the warehouse `config`'s driver connects to, from its `features`."
  [config   :- ::config/config
   features :- [:set :keyword]]
  {:identifier-case (identifier-case config features)
   :schemas?        (contains? features :schemas)
   :schema-mapping  (or (:schema-mapping config) {})})

(mr/def ::physical-table
  "A table as sync named it: its schema, nil for a schemaless table, and its name."
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:name   :string]])

(mu/defn physical-table :- ::physical-table
  "The Table sync made of `relation`: each part as written when the project quoted it, folded as `naming` says
  otherwise. The
  schema is what `:schema-mapping` says when it has an entry for it, else nil for a warehouse without schemas."
  [{:keys [identifier-case schemas? schema-mapping]} :- ::naming
   {:keys [schema table quoted]}                      :- ::ir/relation]
  {:schema (cond
             (contains? schema-mapping schema) (get schema-mapping schema)
             (not schemas?)                    nil
             (contains? quoted :schema)        schema
             :else                             (fold identifier-case schema))
   :name   (if (contains? quoted :table)
             table
             (fold identifier-case table))})

(mu/defn physical-column :- :string
  "The name sync gave `column`: as written when the project quotes it, folded as `naming` says otherwise."
  [{:keys [identifier-case]}            :- ::naming
   {column-name :name, :keys [quoted?]} :- ::ir/column]
  (if quoted?
    column-name
    (fold identifier-case column-name)))

(mr/def ::state
  "Everything a provider knows, see [[SemanticLayerMetadata]]."
  [:map {:closed true}
   [:naming   ::naming]
   [:database ::lib.schema.metadata/database]
   [:tables   [:sequential ::lib.schema.metadata/table]]
   [:fields   [:sequential ::lib.schema.metadata/column]]
   [:cards    [:sequential ::lib.schema.metadata/card]]
   [:next-id  ::id]])

(mu/defn- metadatas-of-type :- [:sequential [:or ::lib.schema.metadata/table
                                             ::lib.schema.metadata/column
                                             ::lib.schema.metadata/card]]
  "Every piece of metadata of `metadata-type` (`:metadata/table`, `:metadata/column` or `:metadata/card`) in `state`."
  [state         :- ::state
   metadata-type :- :keyword]
  (case metadata-type
    :metadata/table  (:tables state)
    :metadata/column (:fields state)
    :metadata/card   (:cards state)
    []))

;; Everything the provider knows is in memory, in `state`: the tables and fields the project documents, and what the
;; resolve stage adds as it goes, a column the project never documented (see [[column]]) and the card of each
;; converted metric (see [[add-metric!]]). That is why this is a type of its own and not a mock provider over a fixed
;; map. Lib's calculations ask the provider for a cache (see [[metabase.lib.metadata.cache]]) and warn at every call
;; when there is none, so [[metadata-provider]] wraps it in Lib's own caching proxy, whose cache is dropped whenever
;; something is added (see [[add!]]), so nothing computed before knows a stale world.
(deftype SemanticLayerMetadata [state]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (:database @state))
  (metadatas [_this {metadata-type :lib/type, :as metadata-spec}]
    (into []
          (lib.metadata.protocols/default-spec-filter-xform metadata-spec)
          (metadatas-of-type @state metadata-type)))
  (setting [_this _setting-key]
    nil))

(mu/defn- state :- (ms/InstanceOfClass clojure.lang.Atom)
  "The atom holding the `::state` of `provider`, Lib's caching proxy around a [[SemanticLayerMetadata]]."
  [^CachedProxyMetadataProvider provider :- (ms/InstanceOfClass CachedProxyMetadataProvider)]
  (.state ^SemanticLayerMetadata (.-metadata-provider provider)))

(mu/defn- next-id! :- ::id
  "A fresh id in `provider`."
  [provider :- ::lib.schema.metadata/metadata-provider]
  (:next-id (swap! (state provider) update :next-id inc)))

(mu/defn- add! :- [:or ::lib.schema.metadata/column ::lib.schema.metadata/card]
  "Add `metadata` to the `k` (`:fields` or `:cards`) of `provider`, which now knows something new: its cache is
  dropped. Returns `metadata`."
  [provider :- ::lib.schema.metadata/metadata-provider
   k        :- [:enum :fields :cards]
   metadata :- [:or ::lib.schema.metadata/column ::lib.schema.metadata/card]]
  (swap! (state provider) update k conj metadata)
  (lib.metadata.protocols/clear-cache! provider)
  metadata)

(mu/defn- field-metadata :- ::lib.schema.metadata/column
  [id              :- ::lib.schema.id/field
   table-id        :- ::lib.schema.id/table
   field-name      :- :string
   field-base-type :- ::lib.schema.common/base-type]
  {:lib/type       :metadata/column
   :id             id
   :table-id       table-id
   :name           field-name
   :display-name   field-name
   :base-type      field-base-type
   :effective-type field-base-type})

(mu/defn- driver-features :- [:set :keyword]
  "The features `driver` supports, as it answers for the Database `database-name`, which it has never connected to: what
  it never has (`median` on MySQL, a regex on SQL Server) is what the resolve stage reports a metric for (see
  [[metabase-enterprise.semantic-layer-import.resolve.metrics/check-features]]). A driver that answers a feature from
  the warehouse's version, which the stub has none of, answers for the version it assumes without one; one that throws
  over the missing connection is taken not to support the feature, which [[driver.u/features]] logs."
  [driver        :- ::config/driver
   database-name :- :string]
  (driver.u/features driver {:lib/type :metadata/database, :id 1, :name database-name, :engine driver}))

(mu/defn metadata-provider :- ::lib.schema.metadata/metadata-provider
  "A provider for the Metabase database `database-name`: the IR tables whose relation lives in it, as Tables, and
  their documented columns, as Fields, the tables numbered from 1 and the fields after them. A column whose declared
  type is unknown gets `:type/*`; the resolve stage reports it before it gets that far."
  [{:keys [driver] :as config} :- ::config/config
   {:keys [tables]}            :- ::ir/semantic-layer
   database-name               :- :string]
  (let [features    (driver-features driver database-name)
        the-naming  (naming config features)
        in-database (filter #(= database-name (table-database config %)) (vals tables))
        tables      (map-indexed (fn [i {:keys [relation]}]
                                   (let [{:keys [schema], table-name :name} (physical-table the-naming relation)]
                                     {:lib/type     :metadata/table
                                      :id           (inc i)
                                      :db-id        1
                                      :name         table-name
                                      :display-name table-name
                                      :schema       schema}))
                                 in-database)
        fields      (map-indexed (fn [i [table-id {:keys [data-type] :as column}]]
                                   (field-metadata (+ (count tables) (inc i)) table-id
                                                   (physical-column the-naming column)
                                                   (or (base-type driver data-type) :type/*)))
                                 (for [[table-id {:keys [columns]}] (map vector (map :id tables) in-database)
                                       column                       (vals columns)]
                                   [table-id column]))]
    (lib.metadata.cached-provider/cached-metadata-provider
     (->SemanticLayerMetadata
      (atom {:naming   the-naming
             :database {:lib/type :metadata/database
                        :id       1
                        :name     database-name
                        :engine   driver
                        :features features}
             :tables   (vec tables)
             :fields   (vec fields)
             :cards    []
             :next-id  (+ (count tables) (count fields))})))))

(mu/defn providers :- [:map-of :string ::lib.schema.metadata/metadata-provider]
  "A [[metadata-provider]] for every Metabase database the config maps a warehouse database to, keyed by its name."
  [config :- ::config/config
   ir     :- ::ir/semantic-layer]
  (into {}
        (map (fn [database-name] [database-name (metadata-provider config ir database-name)]))
        (distinct (vals (:databases config)))))

(mu/defn- provider-naming :- ::naming
  "The `::naming` `provider` named its Tables and Fields by."
  [provider :- ::lib.schema.metadata/metadata-provider]
  (:naming @(state provider)))

(mu/defn table-metadata :- [:maybe ::lib.schema.metadata/table]
  "The Table in `provider` for `table`'s relation, by schema and name as sync names them (see [[physical-table]]):
  matched exactly, or failing that ignoring case, as [[find-named]] matches a column."
  [provider           :- ::lib.schema.metadata/metadata-provider
   {:keys [relation]} :- ::ir/table]
  (let [tables                             (lib.metadata/tables provider)
        {:keys [schema], table-name :name} (physical-table (provider-naming provider) relation)
        matches?                           (fn [same?]
                                             (fn [table]
                                               (and (same? schema (:schema table))
                                                    (same? table-name (:name table)))))]
    (or (m/find-first (matches? =) tables)
        (m/find-first (matches? #(= (some-> %1 u/lower-case-en) (some-> %2 u/lower-case-en))) tables))))

(mu/defn column :- ::lib.schema.metadata/column
  "The Field named `column-name` on `table-id`, matched exactly or ignoring case (see [[find-named]]), so the name the
  project writes in an `expr` finds the Field under the name sync gave it. A column the project did not document is
  added, with no known type, so the instance supplies it when the import binds the field; its name is taken as written
  without quotes and folded as the warehouse would (see [[physical-column]]), since an `expr` writes a column bare. A
  column that does not exist in the warehouse does not fail the import, which makes up an inactive Field for it;
  [[metabase-enterprise.semantic-layer-import.preflight/check]] reports it before the import, and the card fails when
  run otherwise."
  [provider    :- ::lib.schema.metadata/metadata-provider
   table-id    :- ::lib.schema.id/table
   column-name :- :string]
  (or (find-named (lib.metadata/fields provider table-id) column-name)
      (add! provider :fields (field-metadata (next-id! provider) table-id
                                             (physical-column (provider-naming provider)
                                                              {:name column-name, :data-type nil, :description nil
                                                               :quoted? false})
                                             :type/*))))

(mu/defn add-metric! :- ::lib.schema.id/card
  "Add a Metric card for a converted metric to `provider`, so a `[:metric id]` reference to it resolves (Lib types it
  from `dataset-query`) and exports as `entity-id` (see [[portable-card-ref]]). Returns the card's id."
  [provider :- ::lib.schema.metadata/metadata-provider
   {card-name :name, :keys [description table-id dataset-query entity-id]}
   :- [:map {:closed true}
       [:name          :string]
       [:description   [:maybe :string]]
       [:table-id      ::lib.schema.id/table]
       [:dataset-query ::lib.schema/query]
       [:entity-id     :string]]]
  (:id (add! provider :cards {:lib/type      :metadata/card
                              :id            (next-id! provider)
                              :name          card-name
                              :description   description
                              :database-id   1
                              :table-id      table-id
                              :type          :metric
                              :dataset-query dataset-query
                              :entity-id     entity-id})))

(mu/defn portable-card-ref :- :string
  "The `entity_id` serdes writes for the Metric card `card-id`."
  [provider :- ::lib.schema.metadata/metadata-provider
   card-id  :- ::lib.schema.id/card]
  (:entity-id (lib.metadata/card provider card-id)))

(mu/defn database-name :- :string
  "The name of the one database `provider` describes, which is what serdes writes for a `:database`."
  [provider :- ::lib.schema.metadata/metadata-provider]
  (:name (lib.metadata/database provider)))

(mu/defn portable-table-ref :- [:tuple :string [:maybe :string] :string]
  "The `[database schema table]` serdes writes for `table-id`."
  [provider :- ::lib.schema.metadata/metadata-provider
   table-id :- ::lib.schema.id/table]
  (let [{:keys [schema], table-name :name} (lib.metadata/table provider table-id)]
    [(database-name provider) schema table-name]))

(mu/defn portable-field-ref :- [:tuple :string [:maybe :string] :string :string]
  "The `[database schema table column]` serdes writes for `field-id`."
  [provider :- ::lib.schema.metadata/metadata-provider
   field-id :- ::lib.schema.id/field]
  (let [{:keys [table-id], field-name :name} (lib.metadata/field provider field-id)]
    (conj (portable-table-ref provider table-id) field-name)))
