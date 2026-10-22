(ns dev.dbt-import.emit
  "Stage 3 of the converter: turn resolved metrics into Metabase serdes entities and write them as a YAML tree.

  Each metric becomes a Card of `type: metric` with a one-stage MBQL 5 query holding a `source-table` and a single
  `aggregation`, written the way `metabase-enterprise.serialization` exports it: portable refs, no clause UUIDs
  (import regenerates them) and no `result_metadata` (import infers it). The layout matches a real export,

      collections/main/<collection>.yaml
      collections/main/<collection>/<metric>.yaml

  so `clojure -M:run:ee import <dir> -e` loads it. Only knows the resolve stage's output."
  (:require
   [clojure.java.io :as io]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.queries.models.card :as card]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

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

;;; ------------------------------------------------------------- MBQL -------------------------------------------------------------

(mu/defn- field-clause :- vector?
  [{field-ref :ref, :keys [base-type]} :- ::resolved/field]
  [:field {:base-type base-type} field-ref])

(mu/defn- percentile-fraction :- number?
  "dbt writes the percentile as a fraction (`0.95`); tolerate a percentage (`95`) too."
  [p :- number?]
  (if (> p 1) (/ p 100.0) (double p)))

(mu/defn aggregation-clause :- vector?
  "The MBQL 5 aggregation clause for a resolved metric, in serdes (portable-ref) form."
  [{{:keys [agg agg-params fill-nulls-with]} :metric, :keys [field]} :- ::resolved/metric]
  (let [f      (some-> field field-clause)
        clause (case agg
                 ;; SQL COUNT(col) skips nulls, COUNT(1) does not
                 :count          (if f [:count-where {} [:not-null {} f]] [:count {}])
                 ;; a sum of the literal 1 is a row count
                 :sum            (if f [:sum {} f] [:count {}])
                 :average        [:avg {} f]
                 :min            [:min {} f]
                 :max            [:max {} f]
                 :median         [:median {} f]
                 :count_distinct [:distinct {} f]
                 :sum_boolean    [:count-where {} [:= {} f true]]
                 :percentile     [:percentile {} f (percentile-fraction (:percentile agg-params))])]
    (if (some? fill-nulls-with)
      [:coalesce {} clause fill-nulls-with]
      clause)))

(mu/defn dataset-query :- :map
  "A one-stage MBQL 5 query over the metric's source table with its aggregation, in serdes form."
  [{:keys [database source-table] :as metric} :- ::resolved/metric]
  {:lib/type :mbql/query
   :database database
   :stages   [{:lib/type     :mbql.stage/mbql
               :source-table source-table
               :aggregation  [(aggregation-clause metric)]}]})

;;; ----------------------------------------------------------- entities -----------------------------------------------------------

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
   :card_schema            card/current-card-schema-version})

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
  "Write `files` under `out-dir` with the same YAML formatting serdes export uses. Returns the paths written,
  relative to `out-dir`."
  [out-dir :- :string
   files   :- [:sequential ::file]]
  (doseq [{:keys [path entity]} files]
    (dump/spit-yaml! (io/file out-dir path) (serdes/storable entity)))
  (mapv :path files))
