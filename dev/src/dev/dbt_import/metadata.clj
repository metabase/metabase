(ns dev.dbt-import.metadata
  "A Lib metadata provider over a parsed semantic layer, so the converter builds its queries with Lib instead of
  writing MBQL by hand.

  Each Metabase database in the config gets a provider holding one Table per semantic model whose relation lives in
  it and one Field per documented column, all with ids made up here. Lib only needs ids to be consistent within a
  provider; [[portable-table-ref]] and [[portable-field-ref]] turn them back into the names serdes writes. A column a
  measure or filter names but the project never documented is added when first asked for (see [[column]]), with no
  known type.

  Each metric the resolve stage converts is added as a Metric card (see [[add-metric!]]), so a ratio or derived
  metric's `[:metric id]` references resolve, and [[portable-card-ref]] turns a card id back into the `entity_id`
  serdes writes.

  Base types come from the project's declared `data_type` through the driver's own type mapping; see [[base-type]]."
  (:require
   [clojure.string :as str]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.schemas.resolved :as resolved]
   [medley.core :as m]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

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
  unknown or missing. `overrides` (the config's `:base-types`) wins over the driver; its keys are normalized the same
  way as the type."
  [driver    :- :keyword
   overrides :- [:maybe ::resolved/config.base-types]
   data-type :- [:maybe :string]]
  (when-not (str/blank? data-type)
    (let [type-name (normalize-type-name data-type)
          overrides (update-keys (or overrides {}) normalize-type-name)]
      (cond
        (contains? overrides type-name)
        (get overrides type-name)

        ;; an array is an array; Metabase does not type the elements
        (re-find array-type-re type-name)
        :type/*

        :else
        ;; Postgres keys its type map by lower-case names, MySQL and H2 by upper-case ones
        (some (fn [f]
                (sql-jdbc.sync/database-type->base-type driver (keyword (f type-name))))
              [identity
               u/upper-case-en])))))

;;; the provider

(defn- metadatas-of-type [state metadata-type]
  (case metadata-type
    :metadata/table  (:tables state)
    :metadata/column (:fields state)
    :metadata/card   (:cards state)
    []))

;; Everything the provider knows is in memory, so it is its own cache: Lib's calculations ask for one
;; (see [[metabase.lib.metadata.cache]]) and warn at every call when there is none. The general cache is dropped
;; whenever a column or card is added, so nothing computed before knows a stale world.
(deftype ManifestMetadataProvider [state]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (:database @state))
  (metadatas [_this {metadata-type :lib/type, :as metadata-spec}]
    (into []
          (lib.metadata.protocols/default-spec-filter-xform metadata-spec)
          (metadatas-of-type @state metadata-type)))
  (setting [_this _setting-key]
    nil)

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [_this metadata-type metadata-ids]
    (let [ids (set metadata-ids)]
      (filterv #(contains? ids (:id %)) (metadatas-of-type @state metadata-type))))
  (store-metadata! [_this _object]
    ;; the manifest is the authority on what exists
    nil)
  (cached-value [_this k not-found]
    (get-in @state [:cache k] not-found))
  (cache-value! [_this k v]
    (swap! state assoc-in [:cache k] v)
    nil)
  (has-cache? [_this]
    true)
  (clear-cache! [_this]
    (swap! state assoc :cache {})
    nil))

(defn- state [^ManifestMetadataProvider provider]
  (.state provider))

(defn- next-id!
  "A fresh id in `provider`, which is about to learn something new: the general cache is dropped."
  [provider]
  (:next-id (swap! (state provider) #(-> % (update :next-id inc) (assoc :cache {})))))

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

(mu/defn metadata-provider :- ::lib.schema.metadata/metadata-provider
  "A provider for the Metabase database `database-name`: the semantic models whose relation lives in it, as Tables,
  and their documented columns, as Fields. A column whose declared type is unknown gets `:type/*`; the resolve stage
  reports it before it gets that far."
  [{:keys [driver base-types] :as config} :- ::resolved/config
   {:keys [semantic-models]}              :- ::ir/manifest
   database-name                          :- :string]
  (let [models  (filter #(= database-name (get-in config [:databases (-> % :relation :database)]))
                        (vals semantic-models))
        next-id (volatile! 0)
        id!     #(vswap! next-id inc)
        tables  (for [{:keys [relation]} models]
                  {:lib/type     :metadata/table
                   :id           (id!)
                   :db-id        1
                   :name         (:table relation)
                   :display-name (:table relation)
                   :schema       (:schema relation)})
        fields  (for [[table-id {:keys [columns]}] (map vector (map :id tables) models)
                      {column-name :name, :keys [data-type]} (vals columns)]
                  (field-metadata (id!) table-id column-name (or (base-type driver base-types data-type) :type/*)))]
    (->ManifestMetadataProvider
     (atom {:database {:lib/type :metadata/database
                       :id       1
                       :name     database-name
                       :engine   driver
                       :features #{}}
            :tables   (vec tables)
            :fields   (vec fields)
            :cards    []
            :cache    {}
            :next-id  @next-id}))))

(mu/defn providers :- [:map-of :string ::lib.schema.metadata/metadata-provider]
  "A [[metadata-provider]] for every Metabase database the config maps a warehouse database to, keyed by its name."
  [config :- ::resolved/config
   ir     :- ::ir/manifest]
  (into {}
        (map (fn [database-name] [database-name (metadata-provider config ir database-name)]))
        (distinct (vals (:databases config)))))

(mu/defn table :- [:maybe ::lib.schema.metadata/table]
  "The Table for a semantic model's relation, by schema and name."
  [provider   :- ::lib.schema.metadata/metadata-provider
   schema     :- [:maybe :string]
   table-name :- :string]
  (m/find-first #(and (= schema (:schema %)) (= table-name (:name %)))
                (lib.metadata/tables provider)))

(mu/defn column :- ::lib.schema.metadata/column
  "The Field named `column-name` on `table-id`, matched exactly or ignoring case. A column the project did not document
  is added, with no known type, so the instance supplies it when the import binds the field; a column that does not
  exist in the warehouse fails there, with the authoritative metadata."
  [provider    :- ::lib.schema.metadata/metadata-provider
   table-id    :- ::lib.schema.id/table
   column-name :- :string]
  (let [fields (lib.metadata/fields provider table-id)]
    (or (m/find-first #(= column-name (:name %)) fields)
        (m/find-first #(= (u/lower-case-en column-name) (u/lower-case-en (:name %))) fields)
        (let [field (field-metadata (next-id! provider) table-id column-name :type/*)]
          (swap! (state provider) update :fields conj field)
          field))))

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
  (let [id (next-id! provider)]
    (swap! (state provider) update :cards conj
           {:lib/type      :metadata/card
            :id            id
            :name          card-name
            :description   description
            :database-id   1
            :table-id      table-id
            :type          :metric
            :dataset-query dataset-query
            :entity-id     entity-id})
    id))

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
