(ns metabase.indexes.schema
  "Malli schemas and normalization for managed table indexes: the structured index definitions handed to the driver
  index multimethods, and the request lifecycle statuses.

  JSON storage flattens the structured map's keyword-valued fields (`:kind`, `:style`, `:type`, and each column's
  `:direction`) to strings; [[keywordize-structured]] turns them back into keywords so a driver can dispatch on
  `:kind`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::index-name
  "Free-form user input, inlined (quoted and escaped) into DDL. 63 is the Postgres identifier limit, the tightest
  engine we support."
  [:string {:min 1 :max 63}])

(mr/def ::column-name
  ;; looser than ::index-name: column names must match real warehouse columns, and some engines allow up to 255
  [:string {:min 1 :max 255}])

(mr/def ::column
  [:map
   [:name ::column-name]
   [:direction {:optional true} [:enum :asc :desc]]])

(mr/def ::classical-index
  "Postgres / MySQL / SQL Server secondary index."
  [:map
   [:kind [:enum :btree :hash :gin :gist :brin :spgist :fulltext :spatial
           :clustered :nonclustered :columnstore]]
   [:name ::index-name]
   [:columns [:vector {:min 1} ::column]]
   [:include {:optional true} [:vector ::column-name]]
   [:unique {:optional true} :boolean]])

(mr/def ::sortkey
  "Redshift sort key, inline."
  [:map
   [:kind [:= :sortkey]]
   [:style [:enum :compound :interleaved]]
   [:columns [:vector {:min 1} ::column]]])

(mr/def ::distkey
  "Redshift distribution, inline. Only `:key` uses a column (the one DISTKEY column); `:all`/`:even` take none."
  [:and
   [:map
    [:kind    [:= :distkey]]
    [:style   [:enum :key :all :even]]
    [:columns {:optional true} [:vector {:min 1 :max 1} ::column]]]
   [:fn {:error/message "a :key distkey requires its one column"}
    (fn [{:keys [style columns]}] (or (not= style :key) (= 1 (count columns))))]])

(mr/def ::clustering
  "Snowflake (standalone) / BigQuery (inline) clustering. `:name` is required for the standalone form."
  [:map
   [:kind [:= :clustering]]
   [:name {:optional true} ::index-name]
   [:columns [:vector {:min 1} ::column]]])

(mr/def ::order-by
  "ClickHouse ORDER BY, inline."
  [:map
   [:kind [:= :order-by]]
   [:columns [:vector {:min 1} ::column]]])

(mr/def ::skip-index
  "ClickHouse data-skipping index, standalone. Only arg-free types; the parameterized ones need type-args the form
  can't supply yet."
  [:map
   [:kind [:= :skip-index]]
   [:name ::index-name]
   [:columns [:vector {:min 1} ::column]]
   [:type [:enum :minmax :bloom_filter]]
   [:granularity {:optional true} pos-int?]])

(defn keywordize-structured
  "Re-keywordize the structured map's enum-valued fields after JSON storage flattened them to strings."
  [structured]
  (cond-> structured
    (:kind structured)    (update :kind keyword)
    (:style structured)   (update :style keyword)
    (:type structured)    (update :type keyword)
    (:columns structured) (update :columns (fn [cols]
                                             (mapv #(cond-> % (:direction %) (update :direction keyword)) cols)))))

(mr/def ::index-structured
  "A single structured index definition, dispatched on `:kind`. The shape stored in
  `metabase_table_indexes.structured` and handed to the driver index multimethods."
  ;; :decode/normalize runs before the :multi dispatch, so API input with string-valued enum fields decodes cleanly.
  [:multi {:dispatch :kind, :decode/normalize keywordize-structured}
   [:btree ::classical-index] [:hash ::classical-index] [:gin ::classical-index]
   [:gist ::classical-index] [:brin ::classical-index] [:spgist ::classical-index]
   [:fulltext ::classical-index] [:spatial ::classical-index]
   [:clustered ::classical-index] [:nonclustered ::classical-index] [:columnstore ::classical-index]
   [:sortkey ::sortkey] [:distkey ::distkey] [:clustering ::clustering]
   [:order-by ::order-by] [:skip-index ::skip-index]])

(def statuses
  "Valid lifecycle states for a table index request."
  #{:create-pending :update-pending :delete-pending :running :succeeded :failed})
