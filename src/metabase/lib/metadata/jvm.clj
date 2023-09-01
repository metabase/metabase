(ns metabase.lib.metadata.jvm
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:require
   [clojure.set :as set]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.jvm.magic-map :as lib.metadata.jvm.magic-map]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [potemkin :as p]
   [pretty.core :as pretty]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.after-select :as t2.after-select]
   [toucan2.util :as t2.util]))

(methodical/defmulti ^:private bulk-select-conditions
  {:arglists '([model])}
  t2.util/dispatch-on-first-arg)

(methodical/defmethod bulk-select-conditions :default
  [_model]
  nil)

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/table
                                             #_resolved-query ::convert-to-mlv2
                                             #_k              :default]
  [model honeysql k v]
  (let [k (if (not (namespace k))
            (keyword (name model) (name k))
            k)]
    (next-method model honeysql k v)))

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          ::convert-to-mlv2
                                         #_resolved-query :toucan.map-backend/honeysql2]
  [query-type model parsed-arg honeysql]
  (let [parsed-arg (cond-> parsed-arg
                     (not (get-in parsed-arg [:kv-args :id]))
                     (update :kv-args merge (bulk-select-conditions model)))]
    (next-method query-type model parsed-arg honeysql)))

(t2/define-after-select ::convert-to-mlv2
  [instance]
  (-> instance
      (update-keys u/->kebab-case-en)
      (assoc :lib/type (t2/model instance))
      lib.metadata.jvm.magic-map/magic-map))

(methodical/defmethod t2.query/apply-kv-arg [#_model          ::database-id-is-table-db-id
                                             #_resolved-query :toucan.map-backend/honeysql2
                                             #_k              ::database-id]
  [model honeysql _k v]
  (t2.query/apply-kv-arg model honeysql :table/db_id v))

(methodical/defmethod bulk-select-conditions ::bulk-select-conditions-are-archived-false
  [_model]
  {:archived false})

;;;
;;; Database
;;;

(derive :metadata/database :model/Database)
(derive :metadata/database ::convert-to-mlv2)

(methodical/prefer-method! #'t2.after-select/after-select ::convert-to-mlv2 :model/Database)

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/database
                                             #_resolved-query :toucan.map-backend/honeysql2
                                             #_k              ::database-id]
  [model honeysql _k v]
  (t2.query/apply-kv-arg model honeysql :id v))

(methodical/defmethod t2.pipeline/build :after [#_query-type     :toucan.query-type/select.*
                                                #_model          :metadata/database
                                                #_resolved-query :toucan.map-backend/honeysql2]
  [_query-type _model _parsed-arg honeysql]
  (merge honeysql
         {:select [:id :engine :name :dbms_version :settings :is_audit :details]}))

(t2/define-after-select :metadata/database
  [database]
  ;; ignore encrypted details that we cannot decrypt, because that breaks schema
  ;; validation
  (cond-> database
    (not (map? (:details database))) (dissoc :details)))

;;;
;;; Table
;;;

(derive :metadata/table :model/Table)
(derive :metadata/table ::convert-to-mlv2)

(methodical/prefer-method! #'t2.after-select/after-select ::convert-to-mlv2 :model/Table)

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/table
                                             #_resolved-query :toucan.map-backend/honeysql2
                                             #_k              ::database-id]
  [model honeysql _k v]
  (t2.query/apply-kv-arg model honeysql :db_id v))

(methodical/defmethod bulk-select-conditions :metadata/table
  [_model]
  {:active          true
   :visibility_type [:not-in #{"hidden" "technical" "cruft"}]})

(methodical/defmethod t2.pipeline/build :after [#_query-type     :toucan.query-type/select.*
                                                #_model          :metadata/table
                                                #_resolved-query :toucan.map-backend/honeysql2]
  [_query-type _model _parsed-arg honeysql]
  (assoc honeysql
         :select [:id :db_id :name :display_name :schema :active :visibility_type]))

;;;
;;; Field
;;;

(derive :metadata/column :model/Field)
(derive :metadata/column ::convert-to-mlv2)
(derive :metadata/column ::database-id-is-table-db-id)

(methodical/prefer-method! #'t2.after-select/after-select ::convert-to-mlv2 :model/Field)

(methodical/defmethod t2.model/model->namespace :metadata/column
  [_model]
  {:model/Dimension   "dimension"
   :model/FieldValues "values"})

(methodical/defmethod bulk-select-conditions :metadata/column
  [_model]
  {:column/active          true
   :column/visibility_type [:not-in #{"sensitive" "retired"}]})

(methodical/defmethod t2.pipeline/build :after [#_query-type     :toucan.query-type/select.*
                                                #_model          :metadata/column
                                                #_resolved-query :toucan.map-backend/honeysql2]
  [_query-type _model _parsed-arg honeysql]
  (merge
   honeysql
   {:select    [:column/base_type
                :column/coercion_strategy
                :column/database_type
                :column/description
                :column/display_name
                :column/effective_type
                :column/fingerprint
                :column/fk_target_field_id
                :column/id
                :column/name
                :column/nfc_path
                :column/parent_id
                :column/position
                :column/semantic_type
                :column/settings
                :column/table_id
                :column/visibility_type
                :dimension/human_readable_field_id
                :dimension/id
                :dimension/name
                :dimension/type
                :values/human_readable_values
                :values/values]
    :from      [[(t2/table-name :model/Field) :column]]
    :left-join [[(t2/table-name :model/Table) :table]
                [:= :column/table_id :table/id]
                [(t2/table-name :model/Dimension) :dimension]
                [:and
                 [:= :dimension/field_id :column/id]
                 [:inline [:in :dimension/type ["external" "internal"]]]]
                [(t2/table-name :model/FieldValues) :values]
                [:and
                 [:= :values/field_id :column/id]
                 [:= :values/type [:inline "full"]]]]}))

(t2/define-after-select :metadata/column
  [field]
  (let [dimension-type (some-> (:dimension/type field) keyword)]
    (merge
     (dissoc field
             :dimension/human-readable-field-id :dimension/id :dimension/name :dimension/type
             :values/human-readable-values :values/values)
     (when (and (= dimension-type :external)
                (:dimension/human-readable-field-id field))
       {:lib/external-remap {:lib/type :metadata.column.remapping/external
                             :id       (:dimension/id field)
                             :name     (:dimension/name field)
                             :field-id (:dimension/human-readable-field-id field)}})
     (when (and (= dimension-type :internal)
                (:values/values field)
                (:values/human-readable-values field))
       {:lib/internal-remap {:lib/type              :metadata.column.remapping/internal
                             :id                    (:dimension/id field)
                             :name                  (:dimension/name field)
                             :values                (mi/json-out-with-keywordization
                                                     (:values/values field))
                             :human-readable-values (mi/json-out-without-keywordization
                                                     (:values/human-readable-values field))}}))))

;;;
;;; Card
;;;

(derive :metadata/card :model/Card)
(derive :metadata/card ::convert-to-mlv2)
(derive :metadata/card ::bulk-select-conditions-are-archived-false)

(methodical/prefer-method! #'t2.after-select/after-select ::convert-to-mlv2 :model/Card)

(methodical/defmethod t2.model/model->namespace :metadata/card
  [_model]
  {:model/PersistedInfo "persisted"})

(methodical/defmethod t2.query/apply-kv-arg [#_model          :metadata/card
                                             #_resolved-query :toucan.map-backend/honeysql2
                                             #_k              ::database-id]
  [model honeysql _k v]
  (t2.query/apply-kv-arg model honeysql :database_id v))

(methodical/defmethod t2.pipeline/build :after [#_query-type     :toucan.query-type/select.*
                                                #_model          :metadata/card
                                                #_resolved-query :toucan.map-backend/honeysql2]
  [_query-type _model _parsed-arg honeysql]
  (merge honeysql
         {:select    [:card/collection_id
                      :card/database_id
                      :card/dataset
                      :card/dataset_query
                      :card/id
                      :card/name
                      :card/result_metadata
                      :card/table_id
                      :card/visualization_settings
                      :persisted/active
                      :persisted/state
                      :persisted/definition
                      :persisted/query_hash
                      :persisted/table_name]
          :from      [[(t2/table-name :model/Card) :card]]
          :left-join [[(t2/table-name :model/PersistedInfo) :persisted]
                      [:= :persisted/card_id :card/id]]}))

(defn- parse-persisted-info-definition [x]
  ((get-in (t2/transforms :model/PersistedInfo) [:definition :out] identity) x))

(t2/define-after-select :metadata/card
  [card]
  (merge
   (dissoc card :persisted/active :persisted/state :persisted/definition :persisted/query_hash :persisted/table_name)
   (when (:persisted/definition card)
     {:lib/persisted-info {:active     (:persisted/active card)
                           :state      (:persisted/state card)
                           :definition (parse-persisted-info-definition (:persisted/definition card))
                           :query-hash (:persisted/query_hash card)
                           :table-name (:persisted/table_name card)}})))

;;;
;;; Metric
;;;

(derive :metadata/metric :model/Metric)
(derive :metadata/metric ::convert-to-mlv2)
(derive :metadata/metric ::database-id-is-table-db-id)
(derive :metadata/metric ::bulk-select-conditions-are-archived-false)

(methodical/prefer-method! #'t2.after-select/after-select ::convert-to-mlv2 :model/Metric)

(methodical/defmethod t2.pipeline/build :after [#_query-type     :toucan.query-type/select.*
                                                #_model          :metadata/metric
                                                #_resolved-query :toucan.map-backend/honeysql2]
  [_query-type _model _parsed-arg honeysql]
  (merge
   honeysql
   {:select    [:metric/id
                :metric/table_id
                :metric/name
                :metric/description
                :metric/archived
                :metric/definition]
    :from      [[(t2/table-name :model/Metric) :metric]]
    :left-join [[(t2/table-name :model/Table) :table]
                [:= :metric/table_id :table/id]]}))

;;;
;;; Segment
;;;

(derive :metadata/segment :model/Segment)
(derive :metadata/segment ::convert-to-mlv2)
(derive :metadata/segment ::database-id-is-table-db-id)
(derive :metadata/segment ::bulk-select-conditions-are-archived-false)

(methodical/prefer-method! #'t2.after-select/after-select ::convert-to-mlv2 :model/Segment)

(methodical/defmethod t2.pipeline/build [#_query-type     :toucan.query-type/select.*
                                         #_model          :metadata/segment
                                         #_resolved-query :toucan.map-backend/honeysql2]
  [query-type model parsed-arg honeysql]
  (merge
   (let [parsed-arg (cond-> parsed-arg
                      (not (get-in parsed-arg [:kv-args :id]))
                      (assoc-in [:kv-args :archived] false))]
     (next-method query-type model parsed-arg honeysql))
   {:select    [:segment/id
                :segment/table_id
                :segment/name
                :segment/description
                :segment/archived
                :segment/definition]
    :from      [[(t2/table-name :model/Segment) :segment]]
    :left-join [[(t2/table-name :model/Table) :table]
                [:= :segment/table_id :table/id]]}))

;;;
;;; MetadataProvider
;;;

(p/deftype+ UncachedApplicationDatabaseMetadataProvider [database-id]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-not database-id
      (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                              `lib.metadata.protocols/database
                              `UncachedApplicationDatabaseMetadataProvider)
                      {})))
    (t2/select-one :metadata/database ::database-id database-id))

  (table   [_this table-id]   (t2/select-one :metadata/table   ::database-id database-id, :id table-id))
  (field   [_this field-id]   (t2/select-one :metadata/column  ::database-id database-id, :id field-id))
  (card    [_this card-id]    (t2/select-one :metadata/card    ::database-id database-id, :id card-id))
  (metric  [_this metric-id]  (t2/select-one :metadata/metric  ::database-id database-id, :id metric-id))
  (segment [_this segment-id] (t2/select-one :metadata/segment ::database-id database-id, :id segment-id))

  (tables [_this]
    (t2/select :metadata/table ::database-id database-id))

  (fields [_this table-id]
    (t2/select :metadata/column ::database-id database-id, :table_id table-id))

  (metrics [_this table-id]
    (t2/select :metadata/metric ::database-id database-id, :table_id table-id))

  (setting [_this setting-name]
    (setting/get setting-name))

  lib.metadata.protocols/BulkMetadataProvider
  (bulk-metadata [_this metadata-type ids]
    (when (seq ids)
      (t2/select metadata-type ::database-id database-id, :id [:in ids])))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->UncachedApplicationDatabaseMetadataProvider database-id)))

(mu/defn application-database-metadata-provider :- lib.metadata/MetadataProvider
  "An implementation of [[metabase.lib.metadata.protocols/MetadataProvider]] for the application database.

  The application database metadata provider implements both of the optional
  protocols, [[metabase.lib.metadata.protocols/CachedMetadataProvider]]
  and [[metabase.lib.metadata.protocols/BulkMetadataProvider]]. All operations are cached; so you can use the bulk
  operations to pre-warm the cache if you need to."
  [database-id :- ::lib.schema.id/database]
  (lib.metadata.cached-provider/cached-metadata-provider
   (->UncachedApplicationDatabaseMetadataProvider database-id)))

;;;
;;; Helpers
;;;

(def ^:private -metadata-type->model
  {:metadata/database :model/Database
   :metadata/table    :model/Table
   :metadata/column   :model/Field
   :metadata/card     :model/Card
   :metadata/metric   :model/Metric
   :metadata/segment  :model/Segment})

(def ^:private -model->metadata-type
  (set/map-invert -metadata-type->model))

(mu/defn ->mlv2-metadata :- [:multi {:dispatch lib.dispatch/dispatch-value}
                             [:metadata/database lib.metadata/DatabaseMetadata]
                             [:metadata/table    lib.metadata/TableMetadata]
                             [:metadata/column   lib.metadata/ColumnMetadata]
                             [:metadata/card     lib.metadata/CardMetadata]
                             [:metadata/metric   lib.metadata/MetricMetadata]
                             [:metadata/segment  lib.metadata/SegmentMetadata]]
  "Convert a Toucan 2 instance e.g. a `:model/Database` to an equivalent MLv2 metadata type e.g. a
  `:metadata/database`. If this is already MLv2 metadata, returns it as-is."
  [instance :- [:maybe :map]]
  (when instance
    (if (:lib/type instance)
      instance
      (let [model         (t2/model instance)
            metadata-type (or (if (= (namespace model) "metadata")
                                model
                                (-model->metadata-type model))
                              (throw (ex-info (format "Don't know how to convert a %s to MLv2 metadata" model)
                                              {:instance instance})))]
        (lib.metadata.jvm.magic-map/magic-map
         (into {:lib/type metadata-type} (update-keys instance u/->kebab-case-en)))))))
