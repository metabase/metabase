(ns metabase.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.interface :as mi]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(def Segment
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/Segment)

(methodical/defmethod t2/model-for-automagic-hydration [:default :segment] [_original-model _k] :model/Segment)

(t2/deftransforms :model/Segment
  {:definition mi/transform-metric-segment-definition})

(doto :model/Segment
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(t2/define-before-update :model/Segment  [{:keys [creator_id id], :as segment}]
  (def segment segment)
  (u/prog1 (t2/changes segment)
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? <> :creator_id)
      (when (not= creator_id (t2/select-one-fn :creator_id Segment :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a Segment.")))))))

(defmethod mi/perms-objects-set Segment
  [segment read-or-write]
  (let [table (or (:table segment)
                  (t2/select-one ['Table :db_id :schema :id] :id (u/the-id (:table_id segment))))]
    (mi/perms-objects-set table read-or-write)))

(mu/defn ^:private definition-description :- [:maybe ::lib.schema.common/non-blank-string]
  "Calculate a nice description of a Segment's definition."
  [metadata-provider :- lib.metadata/MetadataProvider
   {table-id :table_id, :keys [definition], :as _segment}]
  (when (seq definition)
    (when-let [{database-id :db-id} (when table-id (lib.metadata.protocols/table metadata-provider table-id))]
      (try
        (let [definition (merge {:source-table table-id}
                                definition)
              query      (lib.query/query-from-legacy-inner-query metadata-provider database-id definition)]
          (lib/describe-top-level-key query :filters))
        (catch Throwable e
          (log/error e (tru "Error calculating Segment description: {0}" (ex-message e)))
          nil)))))

(defn- warmed-metadata-provider [segments]
  (let [metadata-provider (doto (lib.metadata.jvm/application-database-metadata-provider)
                            (lib.metadata.protocols/store-metadatas! :metadata/segment segments))
        field-ids         (mbql.u/referenced-field-ids (map :definition segments))
        fields            (lib.metadata.protocols/bulk-metadata metadata-provider :metadata/field field-ids)
        table-ids         (into #{}
                                (comp cat (map :table_id))
                                [fields segments])]
    ;; this is done for side effects
    (lib.metadata.protocols/bulk-metadata metadata-provider :metadata/table table-ids)
    metadata-provider))

(methodical/defmethod t2.hydrate/batched-hydrate [Segment :definition_description]
  [_model _key segments]
  (let [metadata-provider (warmed-metadata-provider segments)]
    (for [segment segments]
      (assoc segment :definition_description (definition-description metadata-provider segment)))))


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(defmethod revision/serialize-instance Segment
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defmethod revision/diff-map Segment
  [model segment1 segment2]
  (if-not segment1
    ;; this is the first version of the segment
    (m/map-vals (fn [v] {:after v}) (select-keys segment2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (select-keys segment1 [:name :description :definition])
                     (select-keys segment2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get-in segment1 [:definition])
                                                                          :after  (get-in segment2 [:definition])})))))


;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes/hash-fields Segment
  [_segment]
  [:name (serdes/hydrated-hash :table) :created_at])

(defmethod serdes/extract-one "Segment"
  [_model-name _opts segment]
  (-> (serdes/extract-one-basics "Segment" segment)
      (update :table_id   serdes/*export-table-fk*)
      (update :creator_id serdes/*export-user*)
      (update :definition serdes/export-mbql)))

(defmethod serdes/load-xform "Segment" [segment]
  (-> segment
      serdes/load-xform-basics
      (update :table_id   serdes/*import-table-fk*)
      (update :creator_id serdes/*import-user*)
      (update :definition serdes/import-mbql)))

(defmethod serdes/dependencies "Segment" [{:keys [definition table_id]}]
  (into [] (set/union #{(serdes/table->path table_id)}
                      (serdes/mbql-deps definition))))

(defmethod serdes/storage-path "Segment" [segment _ctx]
  (let [{:keys [id label]} (-> segment serdes/path last)]
    (-> segment
        :table_id
        serdes/table->path
        serdes/storage-table-path-prefix
        (concat ["segments" (serdes/storage-leaf-file-name id label)]))))
