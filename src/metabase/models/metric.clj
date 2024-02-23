(ns metabase.models.metric
  "A Metric is a saved MBQL 'macro' expanding to a combination of `:aggregation` and/or `:filter` clauses.
  It is passed in as an `:aggregation` clause but is replaced by the `expand-macros` middleware with the appropriate
  clauses."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.models.table :as table]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(def Metric
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/LegacyMetric)

(methodical/defmethod t2/table-name :model/LegacyMetric [_model] :metric)

(doto :model/LegacyMetric
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(t2/deftransforms :model/LegacyMetric
  {:definition mi/transform-metric-segment-definition})

(t2/define-before-update :model/LegacyMetric
  [{:keys [creator_id id], :as metric}]
  (u/prog1 (t2/changes metric)
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? <> :creator_id)
      (when (not= (:creator_id <>) (t2/select-one-fn :creator_id Metric :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Metric.")))))))

(t2/define-before-delete :model/LegacyMetric
  [{:keys [id] :as _metric}]
  (t2/delete! :model/Revision :model "Metric" :model_id id))

(defmethod mi/perms-objects-set Metric
  [metric read-or-write]
  (let [table (or (:table metric)
                  (t2/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id metric))))]
    (mi/perms-objects-set table read-or-write)))

(mu/defn ^:private definition-description :- [:maybe ::lib.schema.common/non-blank-string]
  "Calculate a nice description of a Metric's definition."
  [metadata-provider :- lib.metadata/MetadataProvider
   {:keys [definition], table-id :table_id, :as _metric} :- (ms/InstanceOf :model/LegacyMetric)]
  (when (seq definition)
    (try
      (let [database-id (u/the-id (lib.metadata.protocols/database metadata-provider))
            definition  (merge {:source-table table-id}
                               definition)
            query       (lib.query/query-from-legacy-inner-query metadata-provider database-id definition)]
        (lib/describe-query query))
      (catch Throwable e
        (log/error e (tru "Error calculating Metric description: {0}" (ex-message e)))
        nil))))

(mu/defn ^:private warmed-metadata-provider :- lib.metadata/MetadataProvider
  [database-id :- ::lib.schema.id/database
   metrics     :- [:maybe [:sequential (ms/InstanceOf :model/LegacyMetric)]]]
  (let [metadata-provider (doto (lib.metadata.jvm/application-database-metadata-provider database-id)
                            (lib.metadata.protocols/store-metadatas!
                             :metadata/metric
                             (map #(lib.metadata.jvm/instance->metadata % :metadata/metric)
                                  metrics)))
        segment-ids       (into #{} (mbql.u/match (map :definition metrics)
                                      [:segment (id :guard integer?) & _]
                                      id))
        segments          (lib.metadata.protocols/bulk-metadata metadata-provider :metadata/segment segment-ids)
        field-ids         (mbql.u/referenced-field-ids (into []
                                                             (comp cat (map :definition))
                                                             [metrics segments]))
        fields            (lib.metadata.protocols/bulk-metadata metadata-provider :metadata/column field-ids)
        table-ids         (into #{}
                                cat
                                [(map :table-id fields)
                                 (map :table-id segments)
                                 (map :table_id metrics)])]
    ;; this is done for side-effects
    (lib.metadata.protocols/bulk-metadata metadata-provider :metadata/table table-ids)
    metadata-provider))

(mu/defn ^:private metrics->table-id->warmed-metadata-provider :- fn?
  [metrics :- [:maybe [:sequential (ms/InstanceOf :model/LegacyMetric)]]]
  (let [table-id->db-id             (when-let [table-ids (not-empty (into #{} (map :table_id metrics)))]
                                      (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))
        db-id->metadata-provider    (memoize
                                     (mu/fn db-id->warmed-metadata-provider :- lib.metadata/MetadataProvider
                                       [database-id :- ::lib.schema.id/database]
                                       (let [metrics-for-db (filter (fn [metric]
                                                                      (= (table-id->db-id (:table_id metric))
                                                                         database-id))
                                                                    metrics)]
                                         (warmed-metadata-provider database-id metrics-for-db))))]
    (mu/fn table-id->warmed-metadata-provider :- lib.metadata/MetadataProvider
      [table-id :- ::lib.schema.id/table]
      (-> table-id table-id->db-id db-id->metadata-provider))))

(methodical/defmethod t2.hydrate/batched-hydrate [Metric :definition_description]
  [_model _key metrics]
  (let [table-id->warmed-metadata-provider (metrics->table-id->warmed-metadata-provider metrics)]
    (for [metric metrics
          :let    [metadata-provider (table-id->warmed-metadata-provider (:table_id metric))]]
      (assoc metric :definition_description (definition-description metadata-provider metric)))))


;;; --------------------------------------------------- REVISIONS ----------------------------------------------------

(defmethod revision/serialize-instance Metric
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defmethod revision/diff-map Metric
  [model metric1 metric2]
  (if-not metric1
    ;; model is the first version of the metric
    (m/map-vals (fn [v] {:after v}) (select-keys metric2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (select-keys metric1 [:name :description :definition])
                     (select-keys metric2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get metric1 :definition)
                                                                          :after  (get metric2 :definition)})))))


;;; ------------------------------------------------- SERIALIZATION --------------------------------------------------

(defmethod serdes/hash-fields Metric
  [_metric]
  [:name (serdes/hydrated-hash :table) :created_at])

(defmethod serdes/extract-one "Metric"
  [_model-name _opts metric]
  (-> (serdes/extract-one-basics "Metric" metric)
      (update :table_id   serdes/*export-table-fk*)
      (update :creator_id serdes/*export-user*)
      (update :definition serdes/export-mbql)))

(defmethod serdes/load-xform "Metric" [metric]
  (-> metric
      serdes/load-xform-basics
      (update :table_id   serdes/*import-table-fk*)
      (update :creator_id serdes/*import-user*)
      (update :definition serdes/import-mbql)))

(defmethod serdes/dependencies "Metric" [{:keys [definition table_id]}]
  (into [] (set/union #{(serdes/table->path table_id)}
                      (serdes/mbql-deps definition))))

(defmethod serdes/storage-path "Metric" [metric _ctx]
  (let [{:keys [id label]} (-> metric serdes/path last)]
    (-> metric
        :table_id
        serdes/table->path
        serdes/storage-table-path-prefix
        (concat ["metrics" (serdes/storage-leaf-file-name id label)]))))


;;; ------------------------------------------------ Audit Log --------------------------------------------------------

(defmethod audit-log/model-details :model/LegacyMetric
  [metric _event-type]
  (let [table-id (:table_id metric)
        db-id    (table/table-id->database-id table-id)]
    (assoc
     (select-keys metric [:name :description :revision_message])
     :table_id    table-id
     :database_id db-id)))
