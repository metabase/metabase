(ns metabase.typed-schemas.source
  "Data access for typed schemas, reified as a protocol.

  [[SchemaSource]] names every read that [[metabase.typed-schemas.core/fetch-items]]
  performs, so the module's data-access surface is one definition instead of
  selects scattered across namespaces. [[app-db-source]] is the production
  implementation, backed by the application database and filtered by what the
  current user can read.

  Tests reify the protocol with literal values instead of redefining selection
  functions:

    (reify source/SchemaSource
      (library-scope [_ _] {:metric-collection-ids #{20}})
      (metrics [_ _ _] [{:type \"metric\" :key \"revenue\" :id 1}])
      ...)

  All methods return the shaped schema entities produced by the
  `metabase.typed-schemas.schema.*` builders, except [[library-tables]], which
  returns raw table rows (only `:id` is consumed), and [[models]], which returns
  `{:models [...] :errors [...]}` so broken models surface as data.

  When the pipeline needs to read something new, add a protocol method and its
  [[app-db-source]] implementation here — do not call `t2`/`metabot` directly
  from `metabase.typed-schemas.core` or anything downstream of it. That keeps
  the module's data-access surface enumerable and every downstream stage
  testable with literal values."
  (:require
   [clojure.set :as set]
   [metabase.collections.core :as collections]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.typed-schemas.db :as typed-schemas.db]
   [metabase.typed-schemas.schema.common :as schema.common]
   [metabase.typed-schemas.schema.metric :as schema.metric]
   [metabase.typed-schemas.schema.model :as schema.model]
   [metabase.typed-schemas.schema.question :as schema.question]
   [metabase.typed-schemas.schema.table :as schema.table]
   [metabase.typed-schemas.scope :as scope]))

(set! *warn-on-reflection* true)

(defprotocol SchemaSource
  "The data-access patterns behind typed schema generation.

  Scope-resolution methods return ids; entity methods return shaped schema
  entities. A nil `database-ids`/`collection-ids` argument means unscoped;
  an empty set matches nothing."
  (database-ids [source database-ref]
    "Readable database ids matching a database reference, or nil without one.")
  (collection-ids [source collection-refs]
    "Ids of the referenced collections and their descendants, or nil without refs.")
  (library-scope [source scope-options]
    "Resolved [[metabase.typed-schemas.scope/LibraryScope]] for library
    collection refs and include flags, or nil when none are requested.")
  (questions [source database-ids collection-ids]
    "Question schema entities.")
  (models [source database-ids]
    "Model schemas as `{:models [...] :errors [...]}`: entities for models with
    executable actions, plus errors for models that could not be built.")
  (metrics [source database-ids collection-ids]
    "Metric schema entities.")
  (tables [source database-ids table-ids]
    "Table schema entities.")
  (library-tables [source library-scope]
    "Published table rows in the library scope's data collections."))

(defn- previously-synced
  [model-key rows]
  (let [ids (remote-sync/previously-synced-ids model-key (into #{} (map :id) rows))]
    (filterv #(contains? ids (:id %)) rows)))

(defn- curated-library-ids
  [collection-type requested-ids]
  (let [library (collections/library-collection)
        ids     (if (:is_remote_synced library)
                  (into #{} (comp (filter #(= collection-type (:type %))) (map :id))
                        (typed-schemas.db/synced-library-collections (:id library)))
                  #{})]
    (if requested-ids (set/intersection ids requested-ids) ids)))

(defn- curated-tables
  [database-ids table-ids]
  (let [collection-ids (curated-library-ids collections/library-data-collection-type nil)
        published-ids  (into #{} (map :id)
                             (schema.table/select-library-tables {:data-collection-ids collection-ids}))
        table-ids      (if table-ids (set/intersection published-ids (set table-ids)) published-ids)]
    (previously-synced :model/Table (schema.table/select-tables database-ids table-ids))))

(defn- curated-models
  [database-ids]
  (let [models         (schema.common/select-schema-cards :model database-ids nil)
        collection-ids (into #{} (keep :collection_id) models)
        synced-ids     (into #{} (comp (filter :is_remote_synced) (map :id))
                             (when (seq collection-ids) (typed-schemas.db/collections collection-ids)))
        models         (previously-synced :model/Card
                                          (filter #(contains? synced-ids (:collection_id %)) models))
        action-rows    (when (seq models)
                         (previously-synced :model/Action
                                            (typed-schemas.db/model-actions (into #{} (map :id) models))))]
    (schema.model/model-schemas-for-actions models action-rows)))

(def app-db-source
  "The production [[SchemaSource]], backed by the application database."
  (reify SchemaSource
    (database-ids [_ database-ref]
      (scope/database-ids-for-ref database-ref))
    (collection-ids [_ collection-refs]
      (scope/collection-scope collection-refs))
    (library-scope [_ scope-options]
      (scope/library-scope scope-options))
    (questions [_ database-ids collection-ids]
      (vec (schema.question/question-schemas database-ids collection-ids)))
    (models [_ database-ids]
      (curated-models database-ids))
    (metrics [_ database-ids collection-ids]
      (vec (schema.metric/metric-schemas-for-cards
            (previously-synced
             :model/Card
             (schema.common/select-schema-cards
              :metric database-ids
              (curated-library-ids collections/library-metrics-collection-type collection-ids))))))
    (tables [_ database-ids table-ids]
      (vec (schema.table/table-schemas (curated-tables database-ids table-ids))))
    (library-tables [_ library-scope]
      (previously-synced
       :model/Table
       (schema.table/select-library-tables
        {:data-collection-ids (curated-library-ids collections/library-data-collection-type
                                                   (:data-collection-ids library-scope))})))))
