(ns metabase.transforms.models.index-request
  "The `metabase_index_request` model: index/clustering hints declared on a transform target table.

  Each request binds to a transform (`:transform_id`), carries a structured index definition validated against
  [[index-structured]], and tracks a lifecycle `:status`. `:table_id` is backfilled once the target table first
  syncs.

  The structured map is stored as JSON, which flattens keyword-valued fields (`:kind`, `:style`, `:type`, and each
  column's `:direction`) to strings; the `:structured` transform re-keywordizes them on read so a driver can
  dispatch on `:kind`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Structured schema -------------------------------------------------

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
  "Redshift distribution key, inline."
  [:map
   [:kind [:= :distkey]]
   [:column :string]])

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
  "ClickHouse data-skipping index, standalone."
  [:map
   [:kind [:= :skip-index]]
   [:name :string]
   [:columns [:vector {:min 1} ::column]]
   [:type [:enum :minmax :set :bloom_filter :ngrambf_v1 :tokenbf_v1]]
   [:type-args {:optional true} [:vector :any]]
   [:granularity {:optional true} pos-int?]])

(mr/def ::index-structured
  "A single structured index definition, dispatched on `:kind`. The shape stored in
  `metabase_index_request.structured` and handed to the driver index multimethods."
  [:multi {:dispatch :kind}
   [:btree ::classical-index] [:hash ::classical-index] [:gin ::classical-index]
   [:gist ::classical-index] [:brin ::classical-index] [:spgist ::classical-index]
   [:fulltext ::classical-index] [:spatial ::classical-index]
   [:clustered ::classical-index] [:nonclustered ::classical-index] [:columnstore ::classical-index]
   [:sortkey ::sortkey] [:distkey ::distkey] [:clustering ::clustering]
   [:order-by ::order-by] [:skip-index ::skip-index]])

(def statuses
  "Valid lifecycle states for an index request."
  #{:pending :running :succeeded :failed :dropped})

;;; ------------------------------------------------- Model -------------------------------------------------

(methodical/defmethod t2/table-name :model/IndexRequest [_model] :metabase_index_request)

(doto :model/IndexRequest
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- keywordize-structured
  "JSON storage flattens the structured map's keyword-valued fields to strings; turn them back into keywords so a
  driver can dispatch on `:kind` (and friends)."
  [structured]
  (cond-> structured
    (:kind structured)    (update :kind keyword)
    (:style structured)   (update :style keyword)
    (:type structured)    (update :type keyword)
    (:columns structured) (update :columns (fn [cols]
                                             (mapv #(cond-> % (:direction %) (update :direction keyword)) cols)))))

(def ^:private transform-structured
  "JSON in/out for `:structured`, re-keywordizing enum-valued fields on read. Validation lives in the hooks."
  {:in  mi/json-in
   :out (comp keywordize-structured mi/json-out-with-keywordization)})

(t2/deftransforms :model/IndexRequest
  {:structured transform-structured
   :status     mi/transform-keyword})

(defn- validate-request!
  [{:keys [structured status]}]
  (when (seq structured)
    (let [structured (keywordize-structured structured)]
      (when-not (mr/validate ::index-structured structured)
        (throw (ex-info "Invalid index request structured definition"
                        {:structured structured, :explanation (mr/explain ::index-structured structured)})))))
  (when (and status (not (contains? statuses (keyword status))))
    (throw (ex-info "Invalid index request status" {:status status, :allowed statuses}))))

(t2/define-before-insert :model/IndexRequest [req] (validate-request! req) req)
(t2/define-before-update :model/IndexRequest [req] (validate-request! (t2/changes req)) req)
