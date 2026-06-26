(ns metabase.indexes.schema
  "Malli schemas and normalization for managed table indexes: the structured index definitions handed to the driver
  index multimethods, and the request lifecycle statuses.

  JSON storage flattens the structured map's keyword-valued fields (`:kind`, `:style`, `:type`, and each column's
  `:direction`) to strings; [[keywordize-structured]] turns them back into keywords so a driver can dispatch on
  `:kind`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::column
  [:map
   [:name :string]
   [:direction {:optional true} [:enum :asc :desc]]])

(mr/def ::classical-index
  "Postgres / MySQL / SQL Server secondary index."
  [:map
   [:kind [:enum :btree :hash :gin :gist :brin :spgist :fulltext :spatial
           :clustered :nonclustered :columnstore]]
   [:name :string]
   [:columns [:vector {:min 1} ::column]]
   [:include {:optional true} [:vector :string]]
   [:unique {:optional true} :boolean]])

(mr/def ::sortkey
  "Redshift sort key, inline."
  [:map
   [:kind [:= :sortkey]]
   [:style [:enum :compound :interleaved]]
   [:columns [:vector {:min 1} ::column]]])

(mr/def ::distkey
  "Redshift distribution, inline. `:columns` holds the single DISTKEY column, required only for the `:key` style;
  `:all`/`:even`/`:auto` take no column."
  [:and
   [:map
    [:kind    [:= :distkey]]
    [:style   [:enum :key :all :even :auto]]
    [:columns {:optional true} [:vector {:min 1 :max 1} ::column]]]
   [:fn {:error/message "a :key distkey requires a column"}
    (fn [{:keys [style columns]}] (or (not= style :key) (seq columns)))]])

(mr/def ::clustering
  "Snowflake (standalone) / BigQuery (inline) clustering. `:name` is required for the standalone form."
  [:map
   [:kind [:= :clustering]]
   [:name {:optional true} :string]
   [:columns [:vector {:min 1} ::column]]])

(mr/def ::order-by
  "ClickHouse ORDER BY, inline."
  [:map
   [:kind [:= :order-by]]
   [:columns [:vector {:min 1} ::column]]])

(mr/def ::skip-index
  "ClickHouse data-skipping index, standalone. Only the argument-free types are offered; the parameterized ones
  (set/ngrambf_v1/tokenbf_v1) need type-args the request form can't supply yet."
  [:map
   [:kind [:= :skip-index]]
   [:name :string]
   [:columns [:vector {:min 1} ::column]]
   [:type [:enum :minmax :bloom_filter]]
   [:granularity {:optional true} pos-int?]])

(mr/def ::index-structured
  "A single structured index definition, dispatched on `:kind`. The shape stored in
  `metabase_table_indexes.structured` and handed to the driver index multimethods."
  [:multi {:dispatch :kind}
   [:btree ::classical-index] [:hash ::classical-index] [:gin ::classical-index]
   [:gist ::classical-index] [:brin ::classical-index] [:spgist ::classical-index]
   [:fulltext ::classical-index] [:spatial ::classical-index]
   [:clustered ::classical-index] [:nonclustered ::classical-index] [:columnstore ::classical-index]
   [:sortkey ::sortkey] [:distkey ::distkey] [:clustering ::clustering]
   [:order-by ::order-by] [:skip-index ::skip-index]])

(def statuses
  "Valid lifecycle states for a table index request."
  #{:pending :running :succeeded :failed :dropped})

(defn keywordize-structured
  "Re-keywordize the structured map's enum-valued fields after JSON storage flattened them to strings."
  [structured]
  (cond-> structured
    (:kind structured)    (update :kind keyword)
    (:style structured)   (update :style keyword)
    (:type structured)    (update :type keyword)
    (:columns structured) (update :columns (fn [cols]
                                             (mapv #(cond-> % (:direction %) (update :direction keyword)) cols)))))
