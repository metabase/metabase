(ns metabase.transforms.models.index-request
  "The `metabase_index_request` model: index/clustering hints declared on a transform target table.

  Each request binds to a transform (`:transform_id`), carries a structured index definition validated
  against [[index-structured]], and tracks a lifecycle `:status`. `:table_id` is backfilled once the target
  table first syncs. Requests are read at two run-path seams (inline kinds at compile time, standalone kinds
  after the table exists) and applied by [[metabase.transforms.index-manager]].

  The structured map is stored as JSON, which flattens keyword-valued fields (`:kind`, `:style`, `:type`, and
  each column's `:direction`) to strings. The `:structured` transform re-keywordizes them on read, so a driver
  can dispatch on `:kind` without callers having to normalize."
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
  "A single structured index definition, dispatched on `:kind`. This is the typed shape stored in
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

(t2/deftransforms :model/IndexRequest
  {:structured {:in  (:in mi/transform-json)
                :out (comp keywordize-structured (:out mi/transform-json))}
   :status     mi/transform-keyword})

(defn- validate-structured!
  [structured]
  (when-not (mr/validate ::index-structured structured)
    (throw (ex-info "Invalid index request structured definition"
                    {:structured structured
                     :explanation (mr/explain ::index-structured structured)}))))

(t2/define-before-insert :model/IndexRequest
  [{:keys [structured status] :as req}]
  (when structured (validate-structured! (keywordize-structured structured)))
  (when (and status (not (contains? statuses (keyword status))))
    (throw (ex-info "Invalid index request status" {:status status, :allowed statuses})))
  req)

(t2/define-before-update :model/IndexRequest
  [req]
  (let [{:keys [structured status]} (t2/changes req)]
    (when structured (validate-structured! (keywordize-structured structured)))
    (when (and status (not (contains? statuses (keyword status))))
      (throw (ex-info "Invalid index request status" {:status status, :allowed statuses}))))
  req)

;;; ------------------------------------------------- Write API -------------------------------------------------

(defn- request-index-name
  "Physical index name for a structured index. Named kinds (btree, skip-index, ...) carry their own `:name`;
  inline kinds without one (sortkey, order-by, distkey) get a stable per-transform name from their `:kind`, so a
  table can hold at most one of each (enforced by the unique `(transform_id, index_name)` constraint)."
  [structured]
  (or (:name structured) (name (:kind structured))))

(defn create-index-request!
  "Create a `:pending` index request binding `structured` to `transform-id`. Returns the inserted instance."
  [transform-id structured & {:keys [created-by index-name]}]
  (let [structured (keywordize-structured structured)]
    (t2/insert-returning-instance! :model/IndexRequest
                                   {:transform_id transform-id
                                    :index_name   (or index-name (request-index-name structured))
                                    :structured   structured
                                    :status       :pending
                                    :created_by   created-by})))

(defn update-index-request!
  "Replace the `structured` definition of an existing request, resetting it to `:pending`."
  [id structured]
  (t2/update! :model/IndexRequest id {:structured (keywordize-structured structured)
                                      :status     :pending
                                      :error_message nil}))

(defn drop-index-request!
  "Mark a request `:dropped`. The physical DROP happens on the next full rebuild for standalone kinds."
  [id]
  (t2/update! :model/IndexRequest id {:status :dropped}))

(defn mark-status!
  "Set `status` (and optionally `:error_message` / `:last_executed_at`) on a request."
  [id status & {:keys [error-message executed-at]}]
  (t2/update! :model/IndexRequest id
              (cond-> {:status status, :error_message error-message}
                executed-at (assoc :last_executed_at executed-at))))

(defn requests-for-transform
  "All non-dropped index requests for a transform (or just those with `status` when given)."
  ([transform-id]
   (t2/select :model/IndexRequest :transform_id transform-id :status [:not= "dropped"]))
  ([transform-id status]
   (t2/select :model/IndexRequest :transform_id transform-id :status (name status))))

(defn dropped-requests-for-transform
  "Requests marked `:dropped`, whose physical index should be removed on the next full rebuild."
  [transform-id]
  (t2/select :model/IndexRequest :transform_id transform-id :status "dropped"))

(defn backfill-table-id!
  "Set `table_id` on this transform's requests once the synced target table id is known."
  [transform-id table-id]
  (t2/update! :model/IndexRequest :transform_id transform-id {:table_id table-id}))
