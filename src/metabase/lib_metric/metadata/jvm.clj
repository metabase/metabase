(ns metabase.lib-metric.metadata.jvm
  "JVM implementation of MetricMetadataProvider.

   This provider enables building metric queries that span multiple databases.
   It fetches metrics from the Card table (type='metric') without database scoping,
   and routes table/column metadata requests to database-specific providers."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.lib-be.metadata.jvm :as jvm]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as memoize]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table->database-id
  "Memoized lookup of database-id for a table-id."
  []
  (memoize/lru
   (fn [table-id]
     (t2/select-one-fn :db_id :model/Table table-id))
   :lru/threshold 1000))

(defn- metric-spec->honey-sql
  "Build HoneySQL WHERE clause for fetching metrics.
   Metrics are Cards with type='metric' - not scoped to any database."
  [{id-set :id, name-set :name, :keys [table-id card-id], :as _metadata-spec}]
  (let [active-only? (not (or id-set name-set))
        where-clauses (cond-> [[:= :type [:inline "metric"]]]
                        id-set       (conj [:in :id id-set])
                        name-set     (conj [:in :name name-set])
                        table-id     (conj [:= :table_id table-id])
                        table-id     (conj [:= :source_card_id nil])
                        card-id      (conj [:= :source_card_id card-id])
                        active-only? (conj [:= :archived false]))]
    (reduce sql.helpers/where {} where-clauses)))

(defn- fetch-metrics
  "Fetch metrics matching spec, not scoped to any database.
   Returns metrics as metadata objects with :lib/type :metadata/metric."
  [metadata-spec]
  (let [query (metric-spec->honey-sql metadata-spec)]
    (try
      (t2/select :metadata/metric query)
      (catch Throwable e
        (throw (ex-info "Error fetching metrics with spec"
                        {:metadata-spec metadata-spec, :query query}
                        e))))))

(mu/defn metadata-provider :- ::lib.metadata.protocols/metadata-provider
  "Create a MetricMetadataProvider for the JVM.

   This provider:
   - Has no single database context (database returns nil)
   - Fetches metrics from the Card table across all databases
   - Routes table/column metadata to database-specific providers
   - Uses global Metabase settings

   Example usage:
   ```clojure
   (def mp (metadata-provider))

   ;; Returns nil - no single database
   (lib.metadata.protocols/database mp)

   ;; Fetches metrics across all databases
   (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric})

   ;; Routes to correct database provider for table 1
   (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column :table-id 1})
   ```"
  []
  (let [table->db (table->database-id)
        db-provider-fn (memoize/lru
                        jvm/application-database-metadata-provider
                        :lru/threshold 50)]
    (provider/metric-context-metadata-provider
     fetch-metrics
     table->db
     db-provider-fn
     setting/get)))
