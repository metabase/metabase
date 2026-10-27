(ns dev.dbt-import.emit
  "Stage 3 of the converter: turn resolved metrics into Metabase serdes entities and write them as a YAML tree.

  Each metric becomes a Card of `type: metric` whose query is the resolve stage's Lib query, written the way
  [[metabase-enterprise.serialization.dump]] exports it: portable refs, no clause UUIDs (import regenerates them) and
  no `result_metadata` (import infers it). The layout matches a real export,

      collections/main/<collection>.yaml
      collections/main/<collection>/<metric>.yaml

  so `clojure -M:run:ee import <dir> -e` loads it. Only knows the resolve stage's output."
  (:require
   [clojure.java.io :as io]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.models.serialization :as serdes]
   [metabase.queries.models.card :as card]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::entity
  "A serdes entity: a map carrying `:serdes/meta`, as [[serdes/storable]] writes it."
  [:map
   [:serdes/meta [:sequential [:map [:model :string]]]]])

(mr/def ::file
  "One YAML file to write: its path relative to the export root, the entity it holds, and for a card the resolved
  metric it came from."
  [:map
   [:path :string]
   [:entity ::entity]
   [:metric {:optional true} ::resolved/metric]])

(mu/defn- with-portable-refs
  "Run `thunk` with serdes' id lookups bound to `metadata-provider`, so what it exports names the provider's made-up
  database, table and field ids the way a real export names an instance's."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   thunk             :- fn?]
  (binding [serdes/*export-database-fk* (fn [_id] (metadata/database-name metadata-provider))
            serdes/*export-table-fk*    (fn [table-id] (metadata/portable-table-ref metadata-provider table-id))
            serdes/*export-field-fk*    (fn [field-id] (metadata/portable-field-ref metadata-provider field-id))]
    (thunk)))

(mu/defn dataset-query :- :map
  "A resolved metric's query as serdes writes it: `serdes/export-mbql` strips the clause ids and turns the provider's
  ids into names."
  [{:keys [metadata-provider query]} :- ::resolved/metric]
  (with-portable-refs metadata-provider #(serdes/export-mbql query)))

(mu/defn dimensions :- [:map
                        [:dimensions         [:sequential :map]]
                        [:dimension_mappings [:sequential :map]]]
  "A resolved metric's curated dimensions and mappings as serdes writes them on a Card, through the metrics module's
  own export, which turns the field ids in a dimension's `:sources` and a mapping's `:table-id` and `:target` into
  names."
  [{:keys [metadata-provider dimensions dimension-mappings]} :- ::resolved/metric]
  (with-portable-refs metadata-provider
    #(do {:dimensions         (metrics/export-dimensions dimensions)
          :dimension_mappings (metrics/export-dimension-mappings dimension-mappings)})))

(mu/defn- collection-entity :- ::entity
  [{collection-name :name, :keys [entity-id]} :- ::resolved/collection]
  {:serdes/meta [{:model "Collection" :id entity-id :label collection-name}]
   :name        collection-name
   :entity_id   entity-id
   :slug        (u/slugify collection-name)
   :description "Metrics imported from dbt."
   :archived    false})

(mu/defn- card-entity :- ::entity
  [config     :- ::resolved/config
   collection :- ::resolved/collection
   {:keys [metric entity-id] :as resolved-metric} :- ::resolved/metric]
  (merge
   {:serdes/meta            [{:model "Card" :id entity-id :label (:label metric)}]
    :name                   (:label metric)
    :description            (:description metric)
    :entity_id              entity-id
    :type                   :metric
    :display                :scalar
    :collection_id          (:entity-id collection)
    :creator_id             (:creator-email config)
    :dataset_query          (dataset-query resolved-metric)
    :parameters             []
    :parameter_mappings     []
    :visualization_settings {}
    :archived               false
    :enable_embedding       false
    :collection_preview     true
    :card_schema            card/current-card-schema-version}
   (dimensions resolved-metric)))

(mu/defn files :- [:sequential ::file]
  "The files of the serdes tree for a resolved manifest: the collection first, then one card per metric. Card file
  names are slugified labels, deduplicated the way a real export does it."
  [config :- ::resolved/config
   {:keys [collection metrics]} :- ::resolved/manifest]
  (let [collection-slug (storage.util/slugify-name (:name collection))
        unique-name     (lib/non-truncating-unique-name-generator)]
    (into [{:path   (str "collections/main/" collection-slug ".yaml")
            :entity (collection-entity collection)}]
          (map (fn [{:keys [entity-id metric] :as resolved-metric}]
                 (let [file-name (unique-name entity-id (storage.util/slugify-name (:label metric)))]
                   {:path   (str "collections/main/" collection-slug "/" file-name ".yaml")
                    :entity (card-entity config collection resolved-metric)
                    :metric resolved-metric})))
          metrics)))

(mu/defn write! :- [:sequential :string]
  "Write `entries` under `out-dir` with the same YAML formatting serdes export uses. Returns the paths written,
  relative to `out-dir`."
  [out-dir :- :string
   entries :- [:sequential ::file]]
  (doseq [{:keys [path entity]} entries]
    (dump/spit-yaml! (io/file out-dir path) (serdes/storable entity)))
  (mapv :path entries))
