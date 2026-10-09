(ns metabase-enterprise.data-apps.generate.schemas.source
  "Data access for a data app's schema, reified as a protocol.

  [[SchemaSource]] names every read that [[metabase-enterprise.data-apps.generate.schemas/fetch-items]] performs, so
  the data-access surface is one definition. [[app-db-source]] is the production implementation; tests reify the
  protocol with literal values. All methods return the shaped schema entities of the
  `metabase-enterprise.data-apps.generate.schemas.*` builders, except [[library-tables]], which returns raw table rows
  (only `:id` is consumed)."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.schemas.action :as schemas.action]
   [metabase-enterprise.data-apps.generate.schemas.common :as schemas.common]
   [metabase-enterprise.data-apps.generate.schemas.metric :as schemas.metric]
   [metabase-enterprise.data-apps.generate.schemas.table :as schemas.table]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.remote-sync.core :as remote-sync]))

(set! *warn-on-reflection* true)

(def ^:private library-root-entity-ids
  "Entity ids of the root data library and root metrics library collections."
  #{"librarylibrarydatadat" "librarylibrarymetrics"})

(def LibraryScope
  "The library collection tree, classified by collection type: `:data-collection-ids` hold the published tables,
  `:metric-collection-ids` the metrics."
  [:map {:closed true}
   [:data-collection-ids [:set :int]]
   [:metric-collection-ids [:set :int]]])

(defn- app-db-library-scope
  "The [[LibraryScope]] of the root libraries and their descendants, empty where the instance has no library."
  []
  (let [roots       (filter #(contains? collection/library-collection-types (:type %))
                            (when (:is_remote_synced (collections/library-collection))
                              (data-apps.db/collections-with-entity-ids library-root-entity-ids)))
        collections (data-apps.db/synced-library-collections
                     (into #{} (map :id) (concat roots (when (seq roots) (collection/descendants-flat-for roots)))))
        ids-of-type (fn [collection-type]
                      (into #{} (comp (filter #(= (:type %) collection-type)) (map :id)) collections))]
    {:data-collection-ids   (ids-of-type collection/library-data-collection-type)
     :metric-collection-ids (ids-of-type collection/library-metrics-collection-type)}))

(defprotocol SchemaSource
  "The data-access patterns behind schema generation."
  (library-scope [source]
    "The [[LibraryScope]] of the root libraries.")
  (actions [source]
    "Schema entities for query actions that belong to no model.")
  (metrics [source collection-ids]
    "Schema entities for the metrics in `collection-ids`.")
  (tables [source table-ids]
    "Schema entities for the tables with `table-ids`.")
  (library-tables [source collection-ids]
    "Published table rows in `collection-ids`."))

(defn- previously-synced
  [model-key rows]
  (let [ids (remote-sync/previously-synced-ids model-key (into #{} (map :id) rows))]
    (filterv #(contains? ids (:id %)) rows)))

(defn- curated-library-ids
  [scope-key requested-ids]
  (set/intersection (scope-key (app-db-library-scope)) requested-ids))

(defn- curated-tables
  [table-ids]
  (let [collection-ids (:data-collection-ids (app-db-library-scope))
        published-ids  (into #{} (map :id) (schemas.table/select-library-tables collection-ids))
        table-ids      (set/intersection published-ids table-ids)]
    (previously-synced :model/Table (schemas.table/select-tables table-ids))))

(def app-db-source
  "The production [[SchemaSource]], backed by the application database."
  (reify SchemaSource
    (library-scope [_]
      (app-db-library-scope))
    (actions [_]
      (schemas.action/action-schemas))
    (metrics [_ collection-ids]
      (vec (schemas.metric/metric-schemas-for-cards
            (previously-synced
             :model/Card
             (schemas.common/without-unavailable-cards
              (data-apps.db/metric-cards-in-collections
               (curated-library-ids :metric-collection-ids collection-ids)))))))
    (tables [_ table-ids]
      (vec (schemas.table/table-schemas (curated-tables table-ids))))
    (library-tables [_ collection-ids]
      (previously-synced
       :model/Table
       (schemas.table/select-library-tables (curated-library-ids :data-collection-ids collection-ids))))))
